---
name: Django ORM パターン & クエリ最適化
description: Django ORM の QuerySet パターン — select_related/prefetch_related による N+1 防止、annotate/aggregate による集約、F/Q オブジェクト、トランザクション（@transaction.atomic）、マイグレーション戦略。Django バックエンドのクエリを書く・最適化するときに読む。キーワード: QuerySet, select_related, prefetch_related, annotate, F, Q, transaction.atomic, migration, index.
rules:
  - "ループ内で関連オブジェクトにアクセスする場合、select_related（FK/OneToOne）または prefetch_related（M2M/逆方向リレーション）で N+1 を防ぐ。"
  - "アトミックである必要がある複数の DB 操作は @transaction.atomic か with transaction.atomic() コンテキストで包む。"
  - "集約（合計、平均、件数）は annotate()/aggregate() で DB 側で行う — Python で計算しない。"
  - "マイグレーションファイルは常に VCS に含める。migrate --fake や本番 DB への直接 DDL 実行は決して行わない。"
  - "フィルタ条件で頻繁に使われるカラムには Meta.indexes で DB インデックスを宣言する。"
tags:
  - "QuerySet"
  - "select_related"
  - "prefetch_related"
  - "annotate"
  - "F"
  - "Q"
  - "transaction.atomic"
  - "migration"
  - "index"
  - "Django"
---

# 🐍 Django ORM パターン & クエリ最適化

> Django ORM で効率的かつ安全なデータアクセス層を構築する。N+1 防止とトランザクション管理が中核の関心事である。

## 1. 中核原則

- 関連オブジェクトを事前ロード（select_related/prefetch_related）して N+1 を遮断する。
- transaction.atomic で複数操作のアトミック性を保証する。
- Python ループではなく DB の集約関数で集約する。

## 2. ルール

### 2-1. N+1 の防止

```python
# ❌ N+1 — one query per loop iteration (one query per author)
posts = Post.objects.all()
for post in posts:
    print(post.author.name)  # SELECT author on every iteration

# ✅ select_related — FK/OneToOne JOIN
posts = Post.objects.select_related('author').all()

# ✅ prefetch_related — M2M/reverse, separate query with IN clause
posts = Post.objects.prefetch_related('tags', 'comments').all()

# Chaining
posts = Post.objects.select_related('author').prefetch_related('tags')
```

### 2-2. annotate & aggregate

```python
from django.db.models import Count, Avg, Sum, F

# ❌ Python aggregation — loads all records into memory
total = sum(order.amount for order in Order.objects.all())

# ✅ DB aggregation
result = Order.objects.aggregate(total=Sum('amount'), avg=Avg('amount'))
# result = {'total': 1500000, 'avg': 50000}

# annotate — append aggregate value to each row
users = User.objects.annotate(order_count=Count('orders')).filter(order_count__gt=5)

# F object — column arithmetic without loading values into Python
Product.objects.filter(stock__gt=0).update(stock=F('stock') - 1)
```

### 2-3. トランザクション

```python
from django.db import transaction

# Decorator
@transaction.atomic
def create_order(user_id, items):
    order = Order.objects.create(user_id=user_id)
    for item in items:
        OrderItem.objects.create(order=order, **item)
    order.update_total()
    return order

# Context manager (partial transaction)
def process_payment(order_id):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(id=order_id)
        payment = Payment.objects.create(order=order, amount=order.total)
        order.status = 'paid'
        order.save()
```

### 2-4. インデックス宣言

```python
class Order(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    status = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'status']),   # Composite index
            models.Index(fields=['-created_at']),       # Descending
        ]
```

## 3. よくある間違い

- M2M リレーションに `select_related` を使うとエラーになる — FK には `select_related`、M2M には `prefetch_related` を使う。
- `transaction.atomic` 内で外部 API（メール、決済）を呼び出すと、API が成功して DB がロールバックした場合にデータ不整合が生じる。
- マイグレーションの代わりに本番で `--run-syncdb` を使うとマイグレーション履歴が失われる。

## 4. チェックリスト

- [ ] 関連オブジェクトのアクセスに select_related/prefetch_related を使っているか？
- [ ] 複数の DB 操作を transaction.atomic で包んでいるか？
- [ ] 集約を Python ループではなく annotate/aggregate で行っているか？
- [ ] 頻繁にフィルタするカラムに Meta.indexes を宣言しているか？
- [ ] マイグレーションファイルを VCS に含めているか？
