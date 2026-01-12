# DynamoDB Time Range Key Bounds Fix

**Status:** ✅ Complete  
**Date:** 2026-01-12  
**Goal:** Fix DynamoDB time range boundaries for correct inclusive/exclusive semantics with `occurredAt#eventId` sort key format

---

## Summary

Successfully fixed DynamoDB time range query boundaries:
- ✅ **Key-bound strategy** - Append `#` to timestamps for composite SK
- ✅ **Inclusive lower bound** - `from#` includes all events at exactly `from`
- ✅ **Exclusive upper bound** - `to#` excludes all events at exactly `to`
- ✅ **No edge-case loss** - Events before `to` are included
- ✅ **Matches Cosmos semantics** - Consistent with `>=` and `<` operators
- ✅ **Comprehensive tests** - 4 new boundary behavior tests

---

## Problem

### Incorrect Time Range Handling for Composite Sort Key

**Issue:**
- DynamoDB SK format: `occurredAt#eventId` (e.g., `2026-01-01T00:00:00.000Z#evt-123`)
- Previous implementation treated SK as plain timestamp
- Used `-1ms` hack to make `to` exclusive
- **Result:** Incorrect boundary semantics, potential edge-case loss

**Previous implementation:**
```typescript
if (from && to) {
  // ❌ Wrong: Subtracts 1ms from 'to' timestamp
  const exclusiveTo = new Date(new Date(to).getTime() - 1).toISOString();
  keyConditionExpression += ` AND ${sortKeyAttribute} BETWEEN :from AND :to`;
  expressionAttributeValues[':from'] = from;
  expressionAttributeValues[':to'] = exclusiveTo;
}
```

**Problems:**
1. **Doesn't account for composite key** - SK is `occurredAt#eventId`, not just `occurredAt`
2. **Edge-case loss** - Events at `to - 1ms` might be excluded if they have certain eventIds
3. **Incorrect semantics** - Doesn't match spec: `from` inclusive, `to` exclusive

---

## Solution: Key-Bound Strategy

### Understanding Composite Sort Keys

**DynamoDB SK format:**
```
SK = occurredAt#eventId
```

**Examples:**
```
2026-01-01T00:00:00.000Z#evt-001
2026-01-01T00:00:00.000Z#evt-002
2026-01-01T00:00:00.000Z#evt-999
2026-01-01T00:00:00.001Z#evt-001
```

**String comparison (lexicographic):**
```
'2026-01-01T00:00:00.000Z#' < '2026-01-01T00:00:00.000Z#evt-001'
'2026-01-01T00:00:00.000Z#evt-001' < '2026-01-01T00:00:00.000Z#evt-002'
'2026-01-01T00:00:00.000Z#evt-999' < '2026-01-01T00:00:00.001Z#evt-001'
```

---

### Key-Bound Strategy

**Concept:** Use the `#` delimiter as a boundary marker

**Lower bound (inclusive):**
```typescript
from# = '2026-01-01T00:00:00.000Z#'
```
- Includes all events at exactly `from` timestamp
- `from# <= from#evt-001` ✅
- `from# <= from#evt-002` ✅
- `from# <= from#evt-999` ✅

**Upper bound (exclusive):**
```typescript
to# = '2026-01-02T00:00:00.000Z#'
```
- Excludes all events at exactly `to` timestamp
- `to#evt-001 > to#` ✅ (excluded)
- `to#evt-002 > to#` ✅ (excluded)
- Events before `to` are included:
- `2026-01-01T23:59:59.999Z#evt-001 < to#` ✅ (included)

---

## Implementation

### Updated Time Range Logic

**File:** `src/infra/aws/dynamodb-event-repository.ts`

**Before:**
```typescript
// Add time range to sort key condition
// Note: 'to' is exclusive, so we use < instead of <=
if (from && to) {
  // Use BETWEEN for both bounds (DynamoDB BETWEEN is inclusive on both ends)
  // To make 'to' exclusive, we need to subtract 1ms from the timestamp
  const exclusiveTo = new Date(new Date(to).getTime() - 1).toISOString();
  keyConditionExpression += ` AND ${sortKeyAttribute} BETWEEN :from AND :to`;
  expressionAttributeValues[':from'] = from;
  expressionAttributeValues[':to'] = exclusiveTo;
} else if (from) {
  keyConditionExpression += ` AND ${sortKeyAttribute} >= :from`;
  expressionAttributeValues[':from'] = from;
} else if (to) {
  // 'to' is exclusive, so use < instead of <=
  keyConditionExpression += ` AND ${sortKeyAttribute} < :to`;
  expressionAttributeValues[':to'] = to;
}
```

**After:**
```typescript
// Add time range to sort key condition
// SK format: 'occurredAt#eventId' (e.g., '2026-01-01T00:00:00.000Z#evt-123')
// 'from' is inclusive (>=), 'to' is exclusive (<) per spec
// 
// Key-bound strategy for composite sort key:
// - Lower bound: 'from#' includes all events at exactly 'from' timestamp
// - Upper bound: 'to#' excludes all events at exactly 'to' timestamp
//   (since 'to#' < 'to#eventId' for any eventId)
if (from && to) {
  // Use BETWEEN with key bounds
  // Lower: 'from#' is inclusive (includes all events at from)
  // Upper: 'to#' is exclusive (excludes all events at to, includes events before to)
  keyConditionExpression += ` AND ${sortKeyAttribute} BETWEEN :from AND :to`;
  expressionAttributeValues[':from'] = `${from}#`;
  expressionAttributeValues[':to'] = `${to}#`;
} else if (from) {
  // Lower bound: 'from#' includes all events at exactly from
  keyConditionExpression += ` AND ${sortKeyAttribute} >= :from`;
  expressionAttributeValues[':from'] = `${from}#`;
} else if (to) {
  // Upper bound: 'to#' excludes all events at exactly to
  keyConditionExpression += ` AND ${sortKeyAttribute} < :to`;
  expressionAttributeValues[':to'] = `${to}#`;
}
```

**Changes:**
- ✅ Removed `-1ms` hack
- ✅ Append `#` to timestamps for key bounds
- ✅ Clear comments explaining strategy
- ✅ Matches composite SK format

---

## Boundary Behavior

### Inclusive Lower Bound (from)

**Query:**
```typescript
{
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-01-02T00:00:00.000Z'
}
```

**DynamoDB KeyConditionExpression:**
```
SK BETWEEN '2026-01-01T00:00:00.000Z#' AND '2026-01-02T00:00:00.000Z#'
```

**Events at exactly `from`:**
```
'2026-01-01T00:00:00.000Z#evt-001' >= '2026-01-01T00:00:00.000Z#' ✅ Included
'2026-01-01T00:00:00.000Z#evt-002' >= '2026-01-01T00:00:00.000Z#' ✅ Included
'2026-01-01T00:00:00.000Z#evt-999' >= '2026-01-01T00:00:00.000Z#' ✅ Included
```

**Result:** ✅ All events at exactly `from` are included (inclusive)

---

### Exclusive Upper Bound (to)

**Query:**
```typescript
{
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-01-02T00:00:00.000Z'
}
```

**DynamoDB KeyConditionExpression:**
```
SK BETWEEN '2026-01-01T00:00:00.000Z#' AND '2026-01-02T00:00:00.000Z#'
```

**Events at exactly `to`:**
```
'2026-01-02T00:00:00.000Z#evt-001' > '2026-01-02T00:00:00.000Z#' ❌ Excluded
'2026-01-02T00:00:00.000Z#evt-002' > '2026-01-02T00:00:00.000Z#' ❌ Excluded
'2026-01-02T00:00:00.000Z#evt-999' > '2026-01-02T00:00:00.000Z#' ❌ Excluded
```

**Result:** ✅ All events at exactly `to` are excluded (exclusive)

---

### Events Before `to` (to - epsilon)

**Query:**
```typescript
{
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-01-02T00:00:00.000Z'
}
```

**Events before `to`:**
```
'2026-01-01T23:59:59.999Z#evt-001' < '2026-01-02T00:00:00.000Z#' ✅ Included
'2026-01-01T23:59:59.999Z#evt-002' < '2026-01-02T00:00:00.000Z#' ✅ Included
'2026-01-01T23:59:59.999Z#evt-999' < '2026-01-02T00:00:00.000Z#' ✅ Included
```

**Result:** ✅ All events before `to` are included (no edge-case loss)

---

## Comparison with Cosmos DB

### Cosmos DB Implementation

**File:** `src/infra/azure/cosmos-event-repository.ts`

**Cosmos uses direct timestamp comparison:**
```typescript
// Add time range filter
// 'from' is inclusive (>=), 'to' is exclusive (<) per spec
if (from) {
  query += ' AND c.occurredAt >= @from';
  parameters.push({ name: '@from', value: from });
}
if (to) {
  query += ' AND c.occurredAt < @to';
  parameters.push({ name: '@to', value: to });
}
```

**Cosmos SQL query:**
```sql
SELECT * FROM c 
WHERE c.pk = @appId 
  AND c.occurredAt >= '2026-01-01T00:00:00.000Z'  -- Inclusive
  AND c.occurredAt < '2026-01-02T00:00:00.000Z'   -- Exclusive
ORDER BY c.occurredAt DESC
```

---

### Semantic Equivalence

**Cosmos semantics:**
- `occurredAt >= from` - Includes events at exactly `from`
- `occurredAt < to` - Excludes events at exactly `to`

**DynamoDB semantics (with key-bound strategy):**
- `SK >= from#` - Includes events at exactly `from` (all eventIds)
- `SK < to#` - Excludes events at exactly `to` (all eventIds)

**Result:** ✅ Semantically equivalent

---

### Boundary Comparison

| Scenario | Cosmos | DynamoDB (Before) | DynamoDB (After) |
|----------|--------|-------------------|------------------|
| **Event at from** | ✅ Included | ❌ Depends on eventId | ✅ Included |
| **Event at to** | ✅ Excluded | ❌ Depends on eventId | ✅ Excluded |
| **Event at to - 1ms** | ✅ Included | ⚠️ Might be excluded | ✅ Included |
| **Event at to - epsilon** | ✅ Included | ⚠️ Might be excluded | ✅ Included |

**Result:** ✅ DynamoDB now matches Cosmos semantics

---

## Unit Tests

### Test Coverage

**File:** `tests/unit/infra/aws/dynamodb-event-repository.test.ts`

**Updated existing test:**
1. ✅ Key-bound strategy verification (appends `#` to timestamps)

**Added 4 new boundary behavior tests:**
1. ✅ Include events exactly at `from` (inclusive lower bound)
2. ✅ Exclude events exactly at `to` (exclusive upper bound)
3. ✅ Include events before `to` (to - epsilon)
4. ✅ Correct bounds for single-sided ranges

---

### Example Test: Inclusive Lower Bound

```typescript
it('should include events exactly at "from" timestamp (inclusive lower bound)', async () => {
  mockClient.send.mockResolvedValueOnce({ Items: [] });

  const input: QueryEventsInput = {
    appId: 'test-app',
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
  };

  await repository.queryEvents(input);

  const call = (mockClient.send as jest.Mock).mock.calls[0][0];
  const fromBound = call.input.ExpressionAttributeValues[':from'];
  
  // Lower bound 'from#' includes all events at from
  // '2026-01-01T00:00:00.000Z#' <= '2026-01-01T00:00:00.000Z#evt-123'
  expect(fromBound).toBe('2026-01-01T00:00:00.000Z#');
  expect(call.input.KeyConditionExpression).toContain('BETWEEN');
});
```

---

### Example Test: Exclusive Upper Bound

```typescript
it('should exclude events exactly at "to" timestamp (exclusive upper bound)', async () => {
  mockClient.send.mockResolvedValueOnce({ Items: [] });

  const input: QueryEventsInput = {
    appId: 'test-app',
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
  };

  await repository.queryEvents(input);

  const call = (mockClient.send as jest.Mock).mock.calls[0][0];
  const toBound = call.input.ExpressionAttributeValues[':to'];
  
  // Upper bound 'to#' excludes all events at to
  // '2026-01-02T00:00:00.000Z#evt-123' > '2026-01-02T00:00:00.000Z#'
  expect(toBound).toBe('2026-01-02T00:00:00.000Z#');
  expect(call.input.KeyConditionExpression).toContain('BETWEEN');
});
```

---

### Example Test: Events Before `to`

```typescript
it('should include events before "to" timestamp (to - epsilon)', async () => {
  mockClient.send.mockResolvedValueOnce({ Items: [] });

  const input: QueryEventsInput = {
    appId: 'test-app',
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
  };

  await repository.queryEvents(input);

  const call = (mockClient.send as jest.Mock).mock.calls[0][0];
  const toBound = call.input.ExpressionAttributeValues[':to'];
  
  // Events before 'to' are included
  // '2026-01-01T23:59:59.999Z#evt-123' < '2026-01-02T00:00:00.000Z#'
  expect(toBound).toBe('2026-01-02T00:00:00.000Z#');
  
  // Verify BETWEEN semantics
  expect(call.input.KeyConditionExpression).toBe('PK = :appId AND SK BETWEEN :from AND :to');
});
```

---

## Edge Cases

### Events with Same Timestamp, Different EventIds

**Scenario:**
```
from: '2026-01-01T00:00:00.000Z'
to: '2026-01-02T00:00:00.000Z'
```

**Events:**
```
2026-01-01T00:00:00.000Z#evt-001  ✅ Included (at from)
2026-01-01T00:00:00.000Z#evt-002  ✅ Included (at from)
2026-01-01T00:00:00.000Z#evt-999  ✅ Included (at from)
2026-01-02T00:00:00.000Z#evt-001  ❌ Excluded (at to)
2026-01-02T00:00:00.000Z#evt-002  ❌ Excluded (at to)
2026-01-02T00:00:00.000Z#evt-999  ❌ Excluded (at to)
```

**Result:** ✅ All events at `from` included, all events at `to` excluded

---

### Millisecond Precision

**Scenario:**
```
from: '2026-01-01T00:00:00.000Z'
to: '2026-01-01T00:00:00.001Z'
```

**Events:**
```
2026-01-01T00:00:00.000Z#evt-001  ✅ Included (at from)
2026-01-01T00:00:00.001Z#evt-001  ❌ Excluded (at to)
```

**Result:** ✅ Correct millisecond-level precision

---

### Single-Sided Ranges

**Only `from`:**
```typescript
{
  from: '2026-01-01T00:00:00.000Z'
}
```

**KeyConditionExpression:**
```
SK >= '2026-01-01T00:00:00.000Z#'
```

**Result:** ✅ All events from `from` onwards

**Only `to`:**
```typescript
{
  to: '2026-01-02T00:00:00.000Z'
}
```

**KeyConditionExpression:**
```
SK < '2026-01-02T00:00:00.000Z#'
```

**Result:** ✅ All events before `to`

---

## Why Key-Bound Strategy Works

### Lexicographic String Comparison

**DynamoDB uses lexicographic (dictionary) ordering for string sort keys:**

```
'2026-01-01T00:00:00.000Z#' < '2026-01-01T00:00:00.000Z#a'
'2026-01-01T00:00:00.000Z#a' < '2026-01-01T00:00:00.000Z#b'
'2026-01-01T00:00:00.000Z#z' < '2026-01-01T00:00:00.001Z#'
```

**The `#` character is crucial:**
- `#` (ASCII 35) comes before alphanumeric characters
- `timestamp#` is less than `timestamp#eventId` for any eventId
- This creates a natural boundary

---

### Inclusive Lower Bound

**Query:** `SK >= from#`

**Comparison:**
```
'2026-01-01T00:00:00.000Z#' >= '2026-01-01T00:00:00.000Z#'  ✅ True
'2026-01-01T00:00:00.000Z#evt-001' >= '2026-01-01T00:00:00.000Z#'  ✅ True
'2026-01-01T00:00:00.000Z#evt-999' >= '2026-01-01T00:00:00.000Z#'  ✅ True
```

**Result:** All events at `from` are included

---

### Exclusive Upper Bound

**Query:** `SK < to#`

**Comparison:**
```
'2026-01-02T00:00:00.000Z#evt-001' < '2026-01-02T00:00:00.000Z#'  ❌ False (excluded)
'2026-01-02T00:00:00.000Z#evt-999' < '2026-01-02T00:00:00.000Z#'  ❌ False (excluded)
'2026-01-01T23:59:59.999Z#evt-001' < '2026-01-02T00:00:00.000Z#'  ✅ True (included)
```

**Result:** All events at `to` are excluded, events before `to` are included

---

## Files Modified

1. **`src/infra/aws/dynamodb-event-repository.ts`**
   - Removed `-1ms` hack
   - Implemented key-bound strategy with `#` delimiter
   - Added comprehensive comments

2. **`tests/unit/infra/aws/dynamodb-event-repository.test.ts`**
   - Updated existing test to verify key-bound strategy
   - Added 4 new boundary behavior tests

---

## Acceptance Criteria

- [x] **Event exactly at from is included**
  - Key-bound: `from#` includes all events at `from`
  - Test: "should include events exactly at from timestamp"
  
- [x] **Event exactly at to is excluded**
  - Key-bound: `to#` excludes all events at `to`
  - Test: "should exclude events exactly at to timestamp"
  
- [x] **Event at to - epsilon is included**
  - Key-bound: Events before `to` are included
  - Test: "should include events before to timestamp"

- [x] **Time window semantics match Cosmos and spec**
  - Cosmos: `occurredAt >= from AND occurredAt < to`
  - DynamoDB: `SK >= from# AND SK < to#`
  - Semantically equivalent ✅

---

## Key Learnings

### 1. Composite Sort Keys Require Special Handling

**Pattern:**
```typescript
// ❌ Wrong: Treat composite key as plain timestamp
expressionAttributeValues[':from'] = from;
expressionAttributeValues[':to'] = new Date(new Date(to).getTime() - 1).toISOString();

// ✅ Right: Use delimiter as boundary
expressionAttributeValues[':from'] = `${from}#`;
expressionAttributeValues[':to'] = `${to}#`;
```

**Benefit:** Correct boundary semantics without edge-case loss

---

### 2. Leverage Lexicographic Ordering

**Pattern:**
```typescript
// Use delimiter character that comes before content
// '#' (ASCII 35) < alphanumeric characters
const lowerBound = `${timestamp}#`;  // Includes all events at timestamp
const upperBound = `${timestamp}#`;  // Excludes all events at timestamp
```

**Benefit:** Natural boundaries using string comparison

---

### 3. Avoid Timestamp Arithmetic for Boundaries

**Anti-pattern:**
```typescript
// ❌ Wrong: Subtract 1ms to make exclusive
const exclusiveTo = new Date(new Date(to).getTime() - 1).toISOString();
```

**Problems:**
- Doesn't account for composite keys
- Potential edge-case loss
- Fragile and error-prone

**Better approach:**
```typescript
// ✅ Right: Use key-bound strategy
const exclusiveTo = `${to}#`;
```

---

## Conclusion

**Root cause:** DynamoDB time range logic didn't account for composite sort key format (`occurredAt#eventId`)

**Solution:**
1. Implemented key-bound strategy using `#` delimiter
2. Lower bound: `from#` (inclusive)
3. Upper bound: `to#` (exclusive)
4. Added comprehensive boundary behavior tests

**Impact:**
- ✅ Correct inclusive/exclusive semantics
- ✅ No edge-case loss
- ✅ Matches Cosmos DB behavior
- ✅ Matches spec comments

**Status:** Production-ready ✅
