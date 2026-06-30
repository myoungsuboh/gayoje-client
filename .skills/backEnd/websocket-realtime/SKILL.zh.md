---
name: WebSocket 实时通信 (STOMP + Redis Pub/Sub)
description: 使用 Spring WebSocket 和 STOMP 在多实例环境中实现实时位置共享、聊天、实时通知、协作工具等双向实时通信的标准。构建实时双向功能，或设计多实例消息桥接、认证、背压时阅读。关键词: websocket, STOMP, SimpMessagingTemplate, @MessageMapping, @SendTo, spring-websocket, Redis Pub/Sub.
rules:
  - "双向通信用 Spring WebSocket 与 STOMP 协议实现（公司内部标准组合）。"
  - "在握手时刻用 JWT 认证用户。"
  - "多实例环境下用 Redis Pub/Sub 桥接消息。"
  - "1:1 消息发布到用户专属 destination（/user/queue）。"
  - "高频位置发送用背压和选择性加入（opt-in）控制。"
tags:
  - "websocket"
  - "STOMP"
  - "SimpMessagingTemplate"
  - "@MessageMapping"
  - "@SendTo"
  - "spring-websocket"
  - "Redis Pub/Sub"
---

# 📡 WebSocket 实时通信

> HTTP 轮询 (1) 延迟大，(2) 服务器负担重。实时位置共享、聊天、通知、实时协作走 WebSocket 才是标准。构建实时双向功能，或设计多实例/认证/背压时阅读。
>
> 相关技能:
> - 认证基础: [security-backend](../../security/security-backend/SKILL.md)
> - Redis: [redis-cache](../redis-cache/SKILL.md)
> - 日志: [logging-observability](../logging-observability/SKILL.md)

## 1. 核心原则
- 双向通信用 Spring WebSocket 与 STOMP 协议实现（公司内部标准组合）。
- 在握手时刻用 JWT 认证用户。
- 多实例环境下用 Redis Pub/Sub 桥接消息。
- 1:1 消息发布到用户专属 destination（`/user/queue`）。
- 高频位置发送用背压和选择性加入（opt-in）控制。

## 2. 规则

### 2-1. 依赖

```gradle
implementation 'org.springframework.boot:spring-boot-starter-websocket'
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

### 2-2. 基本配置

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // 客户端订阅 prefix
        config.enableSimpleBroker("/topic", "/queue");
        // 单实例: enableSimpleBroker
        // 多实例: enableStompBrokerRelay (RabbitMQ/ActiveMQ) 或下面的 Redis 模式

        // 客户端 → 服务器 消息 prefix
        config.setApplicationDestinationPrefixes("/app");
        // 用户专属队列 prefix
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("https://*.runningcrow.com", "capacitor://localhost")
            .withSockJS();   // 回退支持
    }
}
```

### 2-3. 认证握手

WebSocket 在 HTTP 握手后升级。在握手中执行 JWT 校验。

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
        // 推荐: 查询参数 `?token=` 或首个 STOMP CONNECT 帧的 Authorization 头
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

浏览器无法在 WebSocket 握手中发送自定义头。使用 SockJS 回退或在首个 STOMP CONNECT 帧中携带 token:

```js
const client = new Client({
  brokerURL: 'wss://api.runningcrow.com/ws',
  connectHeaders: { Authorization: `Bearer ${accessToken}` },
  // ...
})
```

### 2-4. 消息发布 — 单实例

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
        // 校验: 该 run 是否归 userId 所有
        messaging.convertAndSend("/topic/runs/" + runId + "/location", update);
    }
}
```

### 2-5. 多实例 — Redis Pub/Sub 桥接

`enableSimpleBroker` 是单实例的内存内路由。在实例 A 发布的消息不会送达实例 B 的订阅者。**用 Redis Pub/Sub 桥接**。

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
            // Redis 频道 → 原样转发到 STOMP 主题
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

流程: 实例 A → Redis publish → 所有实例 listen → 各实例向自己连接的订阅者 STOMP push。

### 2-6. 用户专属消息 (1:1)

```java
// 仅向特定用户发送好友邀请通知
messaging.convertAndSendToUser(
    String.valueOf(targetUserId),  // Principal name
    "/queue/notifications",
    notification
);
```

客户端订阅:
```js
client.subscribe('/user/queue/notifications', (msg) => {
  showNotification(JSON.parse(msg.body))
})
```

`Principal` 映射通过在握手拦截器中 `attrs.put("userId", ...)` 后，另行配置 `UserHandshakeHandler` 来处理。

### 2-7. 背压 & 实时位置选择性加入

像实时位置共享这样的高频消息（1Hz × N 名好友）有流量激增风险。

- **显式 opt-in**: 仅在用户打开"实时共享"开关时才发布。
- **白名单**: 仅向预先选定的好友投递。
- **采样降速**: 若好友未订阅则根本不发布（服务器端 fanout 为 0 则 skip）。
- **消息大小限制**: 最小化坐标以外的元数据。`{lat, lng, t}` 约 16 字节级别。

### 2-8. 客户端侧 (Vue + @stomp/stompjs)

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

### 2-9. 监控 & 负载

- 用 Micrometer export 并发连接数、消息处理率、握手失败率。
- WebSocket 按连接占用内存。1 万并发连接 = JVM 内存预计 ~500MB。
- 使用 ALB/NLB 时将 idle timeout（默认 60 秒）调长（例如 600 秒）。用心跳（10 秒）保持连接。

## 3. 常见错误
- ❌ 握手时不认证、发送 STOMP 消息后才校验 — 允许匿名连接是 DDoS 靶子。
- ❌ `setAllowedOrigins("*")` — 易受 CSWSH（Cross-Site WebSocket Hijacking）攻击。
- ❌ 多实例下仅用 `enableSimpleBroker` — 消息丢失。
- ❌ 允许无认证 token 订阅实时位置消息的主题 — 泄露他人位置。
- ❌ 每次都将消息存入永久存储（DB）— 忽视 WebSocket 的易失特性 + DB 负担。如需则另行异步落库。
- ❌ 缺少客户端 reconnect 逻辑 — 移动网络切换时断连。

### 安全补充项
- 对 WebSocket 消息也应用 Rate Limiting（防止消息频率激增）。
- 校验发布 destination — 在 ChannelInterceptor 中做权限检查，使用户无法向任意主题发布。
- 对日志中的个人位置坐标做脱敏（lat 仅保留小数 2 位）。

## 4. 检查清单
- [ ] 是否用 Spring WebSocket + STOMP 实现双向通信
- [ ] 是否在握手时刻用 JWT 认证（阻止匿名连接）
- [ ] 是否用 `setAllowedOriginPatterns` 限制允许的 origin（禁止 `*`）
- [ ] 若为多实例，是否用 Redis Pub/Sub 桥接消息
- [ ] 是否将 1:1 消息发布到 `/user/queue` 用户专属 destination
- [ ] 是否对高频位置发送应用 opt-in、白名单、背压
- [ ] 客户端是否有 reconnect/heartbeat 逻辑
- [ ] 是否监控并发连接、处理率、握手失败率
