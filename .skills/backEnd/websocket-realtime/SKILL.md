---
name: WebSocket 실시간 통신 (STOMP + Redis Pub/Sub)
description: Spring WebSocket과 STOMP로 라이브 위치 공유·채팅·실시간 알림·협업 도구 등 양방향 실시간 통신을 다중 인스턴스 환경에서 구현하는 표준. 실시간 양방향 기능을 만들거나 다중 인스턴스 메시지 브리지·인증·백프레셔를 설계할 때 읽는다. 키워드: websocket, STOMP, SimpMessagingTemplate, @MessageMapping, @SendTo, spring-websocket, Redis Pub/Sub.
rules:
  - "양방향 통신은 Spring WebSocket 과 STOMP 프로토콜로 구현한다 (사내 표준 조합)."
  - "핸드셰이크 시점에 JWT 로 사용자를 인증한다."
  - "다중 인스턴스에서는 Redis Pub/Sub 으로 메시지를 브리지한다."
  - "1:1 메시지는 사용자 전용 destination(/user/queue)으로 발행한다."
  - "고빈도 위치 전송은 백프레셔와 옵트인으로 제어한다."
tags:
  - "websocket"
  - "STOMP"
  - "SimpMessagingTemplate"
  - "@MessageMapping"
  - "@SendTo"
  - "spring-websocket"
  - "Redis Pub/Sub"
---

# 📡 WebSocket 실시간 통신

> HTTP 폴링은 (1) 지연이 크고, (2) 서버 부담이 크다. 라이브 위치 공유·채팅·알림·실시간 협업은 WebSocket으로 가는 게 표준이다. 실시간 양방향 기능을 만들거나 다중 인스턴스/인증/백프레셔를 설계할 때 읽는다.
>
> 관련 스킬:
> - 인증 기반: [security-backend](../../security/security-backend/SKILL.md)
> - Redis: [redis-cache](../redis-cache/SKILL.md)
> - 로깅: [logging-observability](../logging-observability/SKILL.md)

## 1. 핵심 원칙
- 양방향 통신은 Spring WebSocket 과 STOMP 프로토콜로 구현한다 (사내 표준 조합).
- 핸드셰이크 시점에 JWT 로 사용자를 인증한다.
- 다중 인스턴스에서는 Redis Pub/Sub 으로 메시지를 브리지한다.
- 1:1 메시지는 사용자 전용 destination(`/user/queue`)으로 발행한다.
- 고빈도 위치 전송은 백프레셔와 옵트인으로 제어한다.

## 2. 규칙

### 2-1. 의존성

```gradle
implementation 'org.springframework.boot:spring-boot-starter-websocket'
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

### 2-2. 기본 설정

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // 클라이언트 구독 prefix
        config.enableSimpleBroker("/topic", "/queue");
        // 단일 인스턴스: enableSimpleBroker
        // 다중 인스턴스: enableStompBrokerRelay (RabbitMQ/ActiveMQ) 또는 아래 Redis 패턴

        // 클라이언트 → 서버 메시지 prefix
        config.setApplicationDestinationPrefixes("/app");
        // 사용자 전용 큐 prefix
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("https://*.runningcrow.com", "capacitor://localhost")
            .withSockJS();   // 폴백 지원
    }
}
```

### 2-3. 인증된 핸드셰이크

WebSocket은 HTTP 핸드셰이크 후 업그레이드된다. JWT 검증을 핸드셰이크에서 수행.

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
        // 권장: 쿼리 파라미터 `?token=` 또는 첫 STOMP CONNECT 프레임의 Authorization 헤더
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

브라우저는 WebSocket 핸드셰이크에 커스텀 헤더를 못 보낸다. SockJS 폴백 또는 첫 STOMP CONNECT 프레임에 토큰 포함:

```js
const client = new Client({
  brokerURL: 'wss://api.runningcrow.com/ws',
  connectHeaders: { Authorization: `Bearer ${accessToken}` },
  // ...
})
```

### 2-4. 메시지 발행 — 단일 인스턴스

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
        // 검증: 이 run이 userId 소유인지
        messaging.convertAndSend("/topic/runs/" + runId + "/location", update);
    }
}
```

### 2-5. 다중 인스턴스 — Redis Pub/Sub 브리지

`enableSimpleBroker`는 단일 인스턴스 메모리 내 라우팅이다. 인스턴스 A에 발행한 메시지가 인스턴스 B의 구독자에게 전달되지 않는다. **Redis Pub/Sub으로 브리지**한다.

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
            // Redis 채널 → STOMP 토픽으로 그대로 전달
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

흐름: 인스턴스 A → Redis publish → 모든 인스턴스 listen → 각 인스턴스가 자기 연결된 구독자에게 STOMP push.

### 2-6. 사용자 전용 메시지 (1:1)

```java
// 친구 초대 알림을 특정 사용자에게만
messaging.convertAndSendToUser(
    String.valueOf(targetUserId),  // Principal name
    "/queue/notifications",
    notification
);
```

클라이언트 구독:
```js
client.subscribe('/user/queue/notifications', (msg) => {
  showNotification(JSON.parse(msg.body))
})
```

`Principal` 매핑은 핸드셰이크 인터셉터에서 `attrs.put("userId", ...)` 후 별도 `UserHandshakeHandler` 구성으로 처리.

### 2-7. 백프레셔 & 라이브 위치 옵트인

라이브 위치 공유 같은 고빈도 메시지(1Hz × 친구 N명)는 트래픽 폭증 위험.

- **명시적 옵트인**: 사용자가 "라이브 공유" 토글을 켰을 때만 발행.
- **화이트리스트**: 미리 선택한 친구에게만 전달.
- **샘플링 감속**: 친구가 구독 안 하면 발행 자체 안 함(서버 측 fanout 0이면 skip).
- **메시지 크기 제한**: 좌표 외 메타 최소화. `{lat, lng, t}` 16바이트 수준.

### 2-8. 클라이언트 측 (Vue + @stomp/stompjs)

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

### 2-9. 모니터링 & 부하

- 동시 연결 수, 메시지 처리율, 핸드셰이크 실패율을 Micrometer로 export.
- WebSocket은 connection 별로 메모리를 점유한다. 1만 동시 연결 = JVM 메모리 ~500MB 예상.
- ALB/NLB 사용 시 idle timeout(기본 60초)을 길게(예: 600초). 하트비트(10초)로 연결 유지.

## 3. 흔한 실수
- ❌ 핸드셰이크에서 인증 안 하고 STOMP 메시지 보낸 후 검증 — 익명 연결 허용은 DDoS 표적.
- ❌ `setAllowedOrigins("*")` — CSWSH(Cross-Site WebSocket Hijacking) 취약.
- ❌ 다중 인스턴스에서 `enableSimpleBroker`만 사용 — 메시지 누락.
- ❌ 라이브 위치 메시지를 인증 토큰 없이 토픽 구독 허용 — 타인의 위치 노출.
- ❌ 메시지를 영구 저장소(DB)에 매번 적재 — WebSocket의 휘발성 특성 무시 + DB 부하. 필요하면 별도 비동기 적재.
- ❌ 클라이언트 reconnect 로직 누락 — 모바일 네트워크 전환 시 끊김.

### 보안 추가 항목
- WebSocket 메시지에도 Rate Limiting 적용 (메시지 빈도 폭주 방지).
- 발행 destination 검증 — 사용자가 임의 토픽에 발행하지 못하도록 ChannelInterceptor에서 권한 체크.
- 로그에 개인 위치 좌표 마스킹 (lat 소수 2자리까지만).

## 4. 체크리스트
- [ ] 양방향 통신을 Spring WebSocket + STOMP 로 구현했는가
- [ ] 핸드셰이크 시점에 JWT 로 인증하는가 (익명 연결 차단)
- [ ] `setAllowedOriginPatterns` 로 허용 origin 을 제한했는가 (`*` 금지)
- [ ] 다중 인스턴스라면 Redis Pub/Sub 으로 메시지를 브리지하는가
- [ ] 1:1 메시지를 `/user/queue` 사용자 전용 destination 으로 발행하는가
- [ ] 고빈도 위치 전송에 옵트인·화이트리스트·백프레셔를 적용했는가
- [ ] 클라이언트에 reconnect/heartbeat 로직이 있는가
- [ ] 동시 연결·처리율·핸드셰이크 실패율을 모니터링하는가
