---
name: WebSocket リアルタイム通信 (STOMP + Redis Pub/Sub)
description: Spring WebSocket と STOMP でライブ位置共有・チャット・リアルタイム通知・コラボレーションツールなどの双方向リアルタイム通信を、マルチインスタンス環境で実装する標準。リアルタイム双方向機能を作る場合や、マルチインスタンスのメッセージブリッジ・認証・バックプレッシャーを設計する場合に読む。キーワード: websocket, STOMP, SimpMessagingTemplate, @MessageMapping, @SendTo, spring-websocket, Redis Pub/Sub.
rules:
  - "双方向通信は Spring WebSocket と STOMP プロトコルで実装する（社内標準の組み合わせ）。"
  - "ハンドシェイクの時点で JWT によりユーザーを認証する。"
  - "マルチインスタンスでは Redis Pub/Sub でメッセージをブリッジする。"
  - "1:1 メッセージはユーザー専用 destination（/user/queue）へ発行する。"
  - "高頻度の位置送信はバックプレッシャーとオプトインで制御する。"
tags:
  - "websocket"
  - "STOMP"
  - "SimpMessagingTemplate"
  - "@MessageMapping"
  - "@SendTo"
  - "spring-websocket"
  - "Redis Pub/Sub"
---

# 📡 WebSocket リアルタイム通信

> HTTP ポーリングは (1) 遅延が大きく、(2) サーバー負荷が大きい。ライブ位置共有・チャット・通知・リアルタイムコラボレーションは WebSocket で行くのが標準だ。リアルタイム双方向機能を作る場合や、マルチインスタンス/認証/バックプレッシャーを設計する場合に読む。
>
> 関連スキル:
> - 認証基盤: [security-backend](../../security/security-backend/SKILL.md)
> - Redis: [redis-cache](../redis-cache/SKILL.md)
> - ロギング: [logging-observability](../logging-observability/SKILL.md)

## 1. 中核原則
- 双方向通信は Spring WebSocket と STOMP プロトコルで実装する（社内標準の組み合わせ）。
- ハンドシェイクの時点で JWT によりユーザーを認証する。
- マルチインスタンスでは Redis Pub/Sub でメッセージをブリッジする。
- 1:1 メッセージはユーザー専用 destination（`/user/queue`）へ発行する。
- 高頻度の位置送信はバックプレッシャーとオプトインで制御する。

## 2. ルール

### 2-1. 依存関係

```gradle
implementation 'org.springframework.boot:spring-boot-starter-websocket'
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

### 2-2. 基本設定

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // クライアント購読 prefix
        config.enableSimpleBroker("/topic", "/queue");
        // 単一インスタンス: enableSimpleBroker
        // マルチインスタンス: enableStompBrokerRelay (RabbitMQ/ActiveMQ) または下記の Redis パターン

        // クライアント → サーバー メッセージ prefix
        config.setApplicationDestinationPrefixes("/app");
        // ユーザー専用キュー prefix
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("https://*.runningcrow.com", "capacitor://localhost")
            .withSockJS();   // フォールバック対応
    }
}
```

### 2-3. 認証付きハンドシェイク

WebSocket は HTTP ハンドシェイク後にアップグレードされる。JWT 検証をハンドシェイクで行う。

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
        // 推奨: クエリパラメータ `?token=` または最初の STOMP CONNECT フレームの Authorization ヘッダー
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

ブラウザは WebSocket ハンドシェイクにカスタムヘッダーを送れない。SockJS フォールバックまたは最初の STOMP CONNECT フレームにトークンを含める:

```js
const client = new Client({
  brokerURL: 'wss://api.runningcrow.com/ws',
  connectHeaders: { Authorization: `Bearer ${accessToken}` },
  // ...
})
```

### 2-4. メッセージ発行 — 単一インスタンス

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
        // 検証: この run が userId の所有か
        messaging.convertAndSend("/topic/runs/" + runId + "/location", update);
    }
}
```

### 2-5. マルチインスタンス — Redis Pub/Sub ブリッジ

`enableSimpleBroker` は単一インスタンスのメモリ内ルーティングだ。インスタンス A に発行したメッセージはインスタンス B の購読者に届かない。**Redis Pub/Sub でブリッジ**する。

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
            // Redis チャネル → STOMP トピックへそのまま転送
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

フロー: インスタンス A → Redis publish → 全インスタンスが listen → 各インスタンスが自分に接続した購読者へ STOMP push。

### 2-6. ユーザー専用メッセージ (1:1)

```java
// 友達招待通知を特定ユーザーだけに
messaging.convertAndSendToUser(
    String.valueOf(targetUserId),  // Principal name
    "/queue/notifications",
    notification
);
```

クライアント購読:
```js
client.subscribe('/user/queue/notifications', (msg) => {
  showNotification(JSON.parse(msg.body))
})
```

`Principal` マッピングはハンドシェイクインターセプターで `attrs.put("userId", ...)` した後、別途 `UserHandshakeHandler` を構成して処理する。

### 2-7. バックプレッシャー & ライブ位置オプトイン

ライブ位置共有のような高頻度メッセージ（1Hz × 友達 N 名）はトラフィック急増のリスクがある。

- **明示的オプトイン**: ユーザーが「ライブ共有」トグルをオンにしたときのみ発行。
- **ホワイトリスト**: あらかじめ選択した友達にのみ配信。
- **サンプリング減速**: 友達が購読していなければ発行自体しない（サーバー側 fanout が 0 なら skip）。
- **メッセージサイズ制限**: 座標以外のメタを最小化。`{lat, lng, t}` で 16 バイト程度。

### 2-8. クライアント側 (Vue + @stomp/stompjs)

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

### 2-9. モニタリング & 負荷

- 同時接続数、メッセージ処理率、ハンドシェイク失敗率を Micrometer で export する。
- WebSocket は接続ごとにメモリを占有する。1 万同時接続 = JVM メモリ ~500MB を見込む。
- ALB/NLB 使用時は idle timeout（デフォルト 60 秒）を長く（例: 600 秒）。ハートビート（10 秒）で接続を維持。

## 3. よくある誤り
- ❌ ハンドシェイクで認証せず STOMP メッセージ送信後に検証 — 匿名接続の許可は DDoS の標的。
- ❌ `setAllowedOrigins("*")` — CSWSH（Cross-Site WebSocket Hijacking）に脆弱。
- ❌ マルチインスタンスで `enableSimpleBroker` のみ使用 — メッセージ欠落。
- ❌ ライブ位置メッセージを認証トークンなしでトピック購読許可 — 他人の位置を露出。
- ❌ メッセージを永続ストレージ（DB）に毎回投入 — WebSocket の揮発的特性を無視 + DB 負荷。必要なら別途非同期で投入。
- ❌ クライアントの reconnect ロジック欠落 — モバイルネットワーク切り替え時に切断。

### セキュリティ追加項目
- WebSocket メッセージにも Rate Limiting を適用（メッセージ頻度の急増防止）。
- 発行 destination の検証 — ユーザーが任意のトピックに発行できないよう ChannelInterceptor で権限チェック。
- ログ中の個人位置座標をマスキング（lat は小数 2 桁まで）。

## 4. チェックリスト
- [ ] 双方向通信を Spring WebSocket + STOMP で実装したか
- [ ] ハンドシェイクの時点で JWT 認証しているか（匿名接続の遮断）
- [ ] `setAllowedOriginPatterns` で許可 origin を制限したか（`*` 禁止）
- [ ] マルチインスタンスなら Redis Pub/Sub でメッセージをブリッジしているか
- [ ] 1:1 メッセージを `/user/queue` ユーザー専用 destination で発行しているか
- [ ] 高頻度の位置送信にオプトイン・ホワイトリスト・バックプレッシャーを適用したか
- [ ] クライアントに reconnect/heartbeat ロジックがあるか
- [ ] 同時接続・処理率・ハンドシェイク失敗率をモニタリングしているか
