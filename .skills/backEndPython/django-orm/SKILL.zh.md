---
name: Django ORM 模式 & 查询优化
description: Django ORM 的 QuerySet 模式 — 用 select_related/prefetch_related 防止 N+1、用 annotate/aggregate 聚合、F/Q 对象、事务（@transaction.atomic）以及迁移策略。在编写或优化 Django 后端查询时阅读。关键词: QuerySet, select_related, prefetch_related, annotate, F, Q, transaction.atomic, migration, index.
rules:
  - "在循环内访问关联对象时，用 select_related（FK/OneToOne）或 prefetch_related（M2M/反向关联）防止 N+1。"
  - "用 @transaction.atomic 或 with transaction.atomic() 上下文包裹必须原子化的多个 DB 操作。"
  - "在 DB 中用 annotate()/aggregate() 执行聚合（求和、求平均、计数）— 不要在 Python 中计算。"
  - "始终把迁移文件纳入 VCS；切勿使用 migrate --fake 或在生产 DB 上直接执行 DDL。"
  - "对在过滤条件中频繁使用的列，用 Meta.indexes 声明 DB 索引。"
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

# 🐍 Django ORM 模式 & 查询优化

> 用 Django ORM 构建高效且安全的数据访问层。N+1 防止与事务管理是核心关注点。

## 1. 核心原则

- 预加载关联对象（select_related/prefetch_related）以阻断 N+1。
- 用 transaction.atomic 保证多个操作的原子性。
- 用 DB 聚合函数聚合，而非 Python 循环。

## 2. 规则

### 2-1. 防止 N+1

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

### 2-3. 事务

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

### 2-4. 索引声明

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

## 3. 常见错误

- 对 M2M 关联使用 `select_related` 会报错 — FK 用 `select_related`，M2M 用 `prefetch_related`。
- 在 `transaction.atomic` 内调用外部 API（邮件、支付），若 API 成功而 DB 回滚会导致数据不一致。
- 在生产环境用 `--run-syncdb` 代替迁移会丢失迁移历史。

## 4. 检查清单

- [ ] 访问关联对象时是否使用了 select_related/prefetch_related？
- [ ] 多个 DB 操作是否用 transaction.atomic 包裹？
- [ ] 聚合是否用 annotate/aggregate 而非 Python 循环执行？
- [ ] 是否为频繁过滤的列声明了 Meta.indexes？
- [ ] 迁移文件是否纳入了 VCS？
