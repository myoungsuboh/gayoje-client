---
name: Django ORM Patterns & Query Optimization
description: Django ORM QuerySet patterns — N+1 prevention with select_related/prefetch_related, aggregation with annotate/aggregate, F/Q objects, transactions (@transaction.atomic), and migration strategies. Read when writing or optimizing Django backend queries. Keywords: QuerySet, select_related, prefetch_related, annotate, F, Q, transaction.atomic, migration, index.
rules:
  - "When accessing relation objects inside a loop, prevent N+1 with select_related (FK/OneToOne) or prefetch_related (M2M/reverse relations)."
  - "Wrap multiple DB operations that must be atomic with @transaction.atomic or a with transaction.atomic() context."
  - "Perform aggregations (sum, average, count) with annotate()/aggregate() in the DB — do not compute them in Python."
  - "Always include migration files in VCS; never use migrate --fake or run DDL directly on a production DB."
  - "Declare DB indexes with Meta.indexes for columns that are frequently used in filter conditions."
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

# 🐍 Django ORM Patterns & Query Optimization

> Build an efficient and safe data access layer with the Django ORM. N+1 prevention and transaction management are the core concerns.

## 1. Core Principles

- Pre-load relation objects (select_related/prefetch_related) to block N+1.
- Guarantee atomicity of multiple operations with transaction.atomic.
- Aggregate with DB aggregate functions, not Python loops.

## 2. Rules

### 2-1. Preventing N+1

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

### 2-3. Transactions

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

### 2-4. Index Declarations

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

## 3. Common Mistakes

- Using `select_related` on an M2M relation causes an error — use `select_related` for FK and `prefetch_related` for M2M.
- Calling an external API (email, payment) inside `transaction.atomic` causes a data inconsistency if the API succeeds but the DB rolls back.
- Using `--run-syncdb` on production instead of migrations loses migration history.

## 4. Checklist

- [ ] Are select_related/prefetch_related used for relation object access?
- [ ] Are multiple DB operations wrapped with transaction.atomic?
- [ ] Are aggregations performed with annotate/aggregate instead of Python loops?
- [ ] Are Meta.indexes declared for frequently filtered columns?
- [ ] Are migration files included in VCS?
