---
name: WebSocket Real-Time Communication (STOMP + Redis Pub/Sub)
description: Standards for implementing bidirectional real-time communication — live location sharing, chat, real-time notifications, collaboration tools, etc. — with Spring WebSocket and STOMP in a multi-instance environment. Read when building real-time bidirectional features or designing multi-instance message bridging, authentication, or backpressure. Keywords: websocket, STOMP, SimpMessagingTemplate, @MessageMapping, @SendTo, spring-websocket, Redis Pub/Sub.
rules:
  - "Implement bidirectional communication with Spring WebSocket and the STOMP protocol (the in-house standard combination)."
  - "Authenticate the user with JWT at handshake time."
  - "In multi-instance setups, bridge messages via Redis Pub/Sub."
  - "Publish 1:1 messages to a user-specific destination (/user/queue)."
  - "Control high-frequency location transmission with backpressure and opt-in."
tags:
  - "websocket"
  - "STOMP"
  - "SimpMessagingTemplate"
  - "@MessageMapping"
  - "@SendTo"
  - "spring-websocket"
  - "Redis Pub/Sub"
---

# 📡 WebSocket Real-Time Communication

> HTTP polling has (1) high latency and (2) high server load. For live location sharing, chat, notifications, and real-time collaboration, WebSocket is the standard. Read when building real-time bidirectional features or designing multi-instance/authentication/backpressure.
>
> Related skills:
> - Authentication basis: [security-backend](../../security/security-backend/SKILL.md)
> - Redis: [redis-cache](../redis-cache/SKILL.md)
> - Logging: [logging-observability](../logging-observability/SKILL.md)

## 1. Core Principles
- Implement bidirectional communication with Spring WebSocket and the STOMP protocol (the in-house standard combination).
- Authenticate the user with JWT at handshake time.
- In multi-instance setups, bridge messages via Redis Pub/Sub.
- Publish 1:1 messages to a user-specific destination (`/user/queue`).
- Control high-frequency location transmission with backpressure and opt-in.

## 2. Rules

### 2-1. Dependencies

```gradle
implementation 'org.springframework.boot:spring-boot-starter-websocket'
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

### 2-2. Basic Configuration

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // client subscription prefix
        config.enableSimpleBroker("/topic", "/queue");
        // single instance: enableSimpleBroker
        // multi instance: enableStompBrokerRelay (RabbitMQ/ActiveMQ) or the Redis pattern below

        // client → server message prefix
        config.setApplicationDestinationPrefixes("/app");
        // user-specific queue prefix
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("https://*.runningcrow.com", "capacitor://localhost")
            .withSockJS();   // fallback support
    }
}
```

### 2-3. Authenticated Handshake

A WebSocket is upgraded after the HTTP handshake. Perform JWT verification during the handshake.

```java
@Component
@RequiredArgsConstructor
public class JwtHandshakeInterceptor implements HandshakeInterceptor {
    private final JwtTokenProvider jwt;

    @Override
    public boolean beforeHandshake(ServerHttpRequest req, ServerHttpResponse resp,
                                   WebSocketHandler wsHandler, Map<String, Object> attrs) {
        String token = extractToken(req);
        if (token == null || !jwt.validate(token)) {
            resp.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        Long userId = jwt.getUserId(token);
        attrs.put("userId", userId);
        return true;
    }

    private String extractToken(ServerHttpRequest req) {
        // recommended: query parameter `?token=` or the Authorization header of the first STOMP CONNECT frame
        List<String> tokens = req.getHeaders().get("Authorization");
        if (tokens != null && !tokens.isEmpty()) {
            String h = tokens.get(0);
            if (h.startsWith("Bearer ")) return h.substring(7);
        }
        return null;
    }

    @Override
    public void afterHandshake(...) {}
}
```

Browsers cannot send custom headers in the WebSocket handshake. Use SockJS fallback or include the token in the first STOMP CONNECT frame:

```js
const client = new Client({
  brokerURL: 'wss://api.runningcrow.com/ws',
  connectHeaders: { Authorization: `Bearer ${accessToken}` },
  // ...
})
```

### 2-4. Message Publishing — Single Instance

```java
@RestController
@RequiredArgsConstructor
public class RunLiveController {
    private final SimpMessagingTemplate messaging;

    @MessageMapping("/runs/{runId}/location")
    public void publishLocation(@DestinationVariable Long runId,
                                LocationUpdate update,
                                SimpMessageHeaderAccessor headers) {
        Long userId = (Long) headers.getSessionAttributes().get("userId");
        // validation: whether this run is owned by userId
        messaging.convertAndSend("/topic/runs/" + runId + "/location", update);
    }
}
```

### 2-5. Multi-Instance — Redis Pub/Sub Bridge

`enableSimpleBroker` is single-instance, in-memory routing. A message published on instance A is not delivered to subscribers on instance B. **Bridge it via Redis Pub/Sub.**

```java
@Configuration
@RequiredArgsConstructor
public class RedisBridgeConfig {

    @Bean
    public RedisMessageListenerContainer container(RedisConnectionFactory cf,
                                                    SimpMessagingTemplate ws) {
        var container = new RedisMessageListenerContainer();
        container.setConnectionFactory(cf);
        container.addMessageListener((msg, pattern) -> {
            String channel = new String(msg.getChannel());
            String body = new String(msg.getBody());
            // Redis channel → forward directly to STOMP topic
            String topic = channel.replaceFirst("^events:", "/topic/");
            ws.convertAndSend(topic, body);
        }, new PatternTopic("events:*"));
        return container;
    }
}

@Service
@RequiredArgsConstructor
public class EventPublisher {
    private final StringRedisTemplate redis;

    public void publishLocation(Long runId, LocationUpdate update) {
        redis.convertAndSend("events:runs/" + runId + "/location",
                             serialize(update));
    }
}
```

Flow: instance A → Redis publish → all instances listen → each instance pushes via STOMP to its own connected subscribers.

### 2-6. User-Specific Messages (1:1)

```java
// send a friend-invitation notification only to a specific user
messaging.convertAndSendToUser(
    String.valueOf(targetUserId),  // Principal name
    "/queue/notifications",
    notification
);
```

Client subscription:
```js
client.subscribe('/user/queue/notifications', (msg) => {
  showNotification(JSON.parse(msg.body))
})
```

`Principal` mapping is handled by calling `attrs.put("userId", ...)` in the handshake interceptor, then configuring a separate `UserHandshakeHandler`.

### 2-7. Backpressure & Live Location Opt-In

High-frequency messages like live location sharing (1Hz × N friends) risk traffic spikes.

- **Explicit opt-in**: publish only when the user turns on the "live sharing" toggle.
- **Whitelist**: deliver only to pre-selected friends.
- **Sampling throttle**: do not publish at all if friends are not subscribed (skip when server-side fanout is 0).
- **Message size limit**: minimize metadata beyond coordinates. `{lat, lng, t}` at the ~16-byte level.

### 2-8. Client Side (Vue + @stomp/stompjs)

```bash
npm install @stomp/stompjs
```

```js
import { Client } from '@stomp/stompjs'

export function useLiveRun(runId) {
  const positions = ref([])

  const client = new Client({
    brokerURL: import.meta.env.VITE_WS_URL,
    connectHeaders: { Authorization: `Bearer ${authStore.accessToken}` },
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    onConnect: () => {
      client.subscribe(`/topic/runs/${runId}/location`, (msg) => {
        positions.value.push(JSON.parse(msg.body))
      })
    },
    onStompError: (frame) => console.error('STOMP', frame),
    onWebSocketError: (e) => console.error('WS', e)
  })
  client.activate()

  onUnmounted(() => client.deactivate())
  return { positions }
}
```

### 2-9. Monitoring & Load

- Export concurrent connection count, message throughput, and handshake failure rate via Micrometer.
- WebSocket consumes memory per connection. 10k concurrent connections = JVM memory ~500MB expected.
- When using ALB/NLB, set the idle timeout (default 60s) longer (e.g., 600s). Keep connections alive with heartbeats (10s).

## 3. Common Mistakes
- ❌ Sending STOMP messages without authenticating at the handshake and verifying afterward — allowing anonymous connections is a DDoS target.
- ❌ `setAllowedOrigins("*")` — vulnerable to CSWSH (Cross-Site WebSocket Hijacking).
- ❌ Using only `enableSimpleBroker` in a multi-instance setup — message loss.
- ❌ Allowing topic subscription for live-location messages without an auth token — exposes others' locations.
- ❌ Persisting every message into permanent storage (DB) — ignores WebSocket's ephemeral nature + DB load. If needed, store separately and asynchronously.
- ❌ Missing client reconnect logic — disconnects when switching mobile networks.

### Additional Security Items
- Apply rate limiting to WebSocket messages as well (prevent message-frequency bursts).
- Validate the publish destination — check authorization in a ChannelInterceptor so users cannot publish to arbitrary topics.
- Mask personal location coordinates in logs (lat to 2 decimal places only).

## 4. Checklist
- [ ] Did you implement bidirectional communication with Spring WebSocket + STOMP?
- [ ] Do you authenticate with JWT at handshake time (blocking anonymous connections)?
- [ ] Did you restrict allowed origins with `setAllowedOriginPatterns` (no `*`)?
- [ ] If multi-instance, do you bridge messages via Redis Pub/Sub?
- [ ] Do you publish 1:1 messages to the `/user/queue` user-specific destination?
- [ ] Did you apply opt-in, whitelist, and backpressure to high-frequency location transmission?
- [ ] Does the client have reconnect/heartbeat logic?
- [ ] Do you monitor concurrent connections, throughput, and handshake failure rate?
