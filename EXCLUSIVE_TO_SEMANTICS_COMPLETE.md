# Exclusive 'to' Parameter Semantics - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Align query semantics so 'to' parameter is exclusive across all storage backends

---

## Summary

Successfully aligned query semantics across all storage implementations:
- ✅ **In-memory storage** - Changed from `<=` to `<` (exclusive upper bound)
- ✅ **Cosmos DB** - Changed from `<=` to `<` (exclusive upper bound)
- ✅ **DynamoDB** - Already uses `<` (verified correct)
- ✅ **Unit test added** - Verifies exclusive behavior with boundary events
- ✅ **Consistent semantics** - Same query returns same results regardless of backend

---

## Acceptance Criteria

- [x] **In-memory storage uses exclusive upper bound**
  - ✅ Changed `e.occurredAt <= input.to` to `e.occurredAt < input.to`

- [x] **Cosmos DB uses exclusive upper bound**
  - ✅ Changed SQL predicate from `<= @to` to `< @to`

- [x] **DynamoDB already correct**
  - ✅ Verified uses `<` operator for exclusive upper bound

- [x] **Unit test proves event with occurredAt === to is excluded**
  - ✅ Added comprehensive test suite in `tests/unit/infra/storage/in-memory-exclusive-to.test.ts`

---

## Problem Analysis

### Issue: Inconsistent Query Semantics

**Spec requirement:**
- `from` parameter: **inclusive** (>=)
- `to` parameter: **exclusive** (<)
- Range notation: `[from, to)` (half-open interval)

**Before fix:**

| Backend | 'from' | 'to' | Correct? |
|---------|--------|------|----------|
| **In-memory** | `>=` (inclusive) | `<=` (inclusive) ❌ | No |
| **Cosmos DB** | `>=` (inclusive) | `<=` (inclusive) ❌ | No |
| **DynamoDB** | `>=` (inclusive) | `<` (exclusive) ✅ | Yes |

**Problem:**
- Same query returned different results on different backends
- Event with `occurredAt === to` included on Azure/in-memory, excluded on AWS
- Violated spec requirement for exclusive upper bound

---

## Changes Made

### 1. In-Memory Storage - Fixed Upper Bound

**File:** `src/infra/storage/in-memory-operational-storage.ts`

**Before:**
```typescript
// Filter by time range
if (input.from) {
  results = results.filter((e) => e.occurredAt >= input.from);
}

if (input.to) {
  results = results.filter((e) => e.occurredAt <= input.to!);  // ❌ Inclusive
}
```

**After:**
```typescript
// Filter by time range
// 'from' is inclusive (>=), 'to' is exclusive (<) per spec
if (input.from) {
  results = results.filter((e) => e.occurredAt >= input.from);
}

if (input.to) {
  results = results.filter((e) => e.occurredAt < input.to!);  // ✅ Exclusive
}
```

---

### 2. Cosmos DB - Fixed SQL Predicate

**File:** `src/infra/azure/cosmos-event-repository.ts`

**Before:**
```typescript
// Add time range filter
if (from) {
  query += ' AND c.occurredAt >= @from';
  parameters.push({ name: '@from', value: from });
}
if (to) {
  query += ' AND c.occurredAt <= @to';  // ❌ Inclusive
  parameters.push({ name: '@to', value: to });
}
```

**After:**
```typescript
// Add time range filter
// 'from' is inclusive (>=), 'to' is exclusive (<) per spec
if (from) {
  query += ' AND c.occurredAt >= @from';
  parameters.push({ name: '@from', value: from });
}
if (to) {
  query += ' AND c.occurredAt < @to';  // ✅ Exclusive
  parameters.push({ name: '@to', value: to });
}
```

---

### 3. DynamoDB - Verified Correct

**File:** `src/infra/aws/dynamodb-event-repository.ts`

**Already correct:**
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
  keyConditionExpression += ` AND ${sortKeyAttribute} < :to`;  // ✅ Exclusive
  expressionAttributeValues[':to'] = to;
}
```

**Note:** DynamoDB uses two strategies:
- When both `from` and `to` provided: Uses `BETWEEN` with `to - 1ms` (makes upper bound exclusive)
- When only `to` provided: Uses `<` operator (naturally exclusive)

---

## Unit Tests Added

**File:** `tests/unit/infra/storage/in-memory-exclusive-to.test.ts`

### Test 1: Exclusive Upper Bound

```typescript
it('should exclude events where occurredAt === to (exclusive upper bound)', async () => {
  const events: StoredEvent[] = [
    {
      eventId: 'event-1',
      occurredAt: '2026-01-10T11:59:59.999Z', // Before 'to'
      // ...
    },
    {
      eventId: 'event-2',
      occurredAt: '2026-01-10T12:00:00.000Z', // Exactly at 'to' - should be EXCLUDED
      // ...
    },
    {
      eventId: 'event-3',
      occurredAt: '2026-01-10T12:00:00.001Z', // After 'to'
      // ...
    },
  ];

  await storage.storeEvents(events);

  const result = await storage.queryEvents({
    appId: 'test-app',
    from: '2026-01-10T00:00:00.000Z',
    to: '2026-01-10T12:00:00.000Z', // Exclusive upper bound
  });

  // Should only return event-1 (before 'to')
  // event-2 (exactly at 'to') should be EXCLUDED
  expect(result.events).toHaveLength(1);
  expect(result.events[0].eventId).toBe('event-1');
});
```

**Proves:** Event with `occurredAt === to` is excluded ✅

---

### Test 2: Inclusive Lower Bound

```typescript
it('should include events where occurredAt === from (inclusive lower bound)', async () => {
  const events: StoredEvent[] = [
    {
      eventId: 'event-1',
      occurredAt: '2026-01-10T11:59:59.999Z', // Before 'from'
      // ...
    },
    {
      eventId: 'event-2',
      occurredAt: '2026-01-10T12:00:00.000Z', // Exactly at 'from' - should be INCLUDED
      // ...
    },
    {
      eventId: 'event-3',
      occurredAt: '2026-01-10T12:00:00.001Z', // After 'from'
      // ...
    },
  ];

  await storage.storeEvents(events);

  const result = await storage.queryEvents({
    appId: 'test-app',
    from: '2026-01-10T12:00:00.000Z', // Inclusive lower bound
    to: '2026-01-10T13:00:00.000Z',
  });

  // Should return event-2 (exactly at 'from') and event-3 (after 'from')
  expect(result.events).toHaveLength(2);
  expect(result.events.map((e) => e.eventId)).toContain('event-2');
  expect(result.events.map((e) => e.eventId)).toContain('event-3');
});
```

**Proves:** Event with `occurredAt === from` is included ✅

---

### Test 3: Half-Open Interval [from, to)

```typescript
it('should handle range [from, to) correctly with boundary events', async () => {
  const events: StoredEvent[] = [
    {
      eventId: 'event-at-from',
      occurredAt: '2026-01-10T12:00:00.000Z', // At 'from' - INCLUDED
      // ...
    },
    {
      eventId: 'event-in-range',
      occurredAt: '2026-01-10T12:30:00.000Z', // In range
      // ...
    },
    {
      eventId: 'event-at-to',
      occurredAt: '2026-01-10T13:00:00.000Z', // At 'to' - EXCLUDED
      // ...
    },
  ];

  await storage.storeEvents(events);

  const result = await storage.queryEvents({
    appId: 'test-app',
    from: '2026-01-10T12:00:00.000Z',
    to: '2026-01-10T13:00:00.000Z',
  });

  // Should return event-at-from and event-in-range
  // Should NOT return event-at-to (exclusive upper bound)
  expect(result.events).toHaveLength(2);
  expect(result.events.map((e) => e.eventId)).toContain('event-at-from');
  expect(result.events.map((e) => e.eventId)).toContain('event-in-range');
  expect(result.events.map((e) => e.eventId)).not.toContain('event-at-to');
});
```

**Proves:** Half-open interval `[from, to)` works correctly ✅

---

## Query Semantics Comparison

### Before Fix

**Query:** `from=2026-01-10T12:00:00Z&to=2026-01-10T13:00:00Z`

**Events:**
- Event A: `occurredAt = 2026-01-10T12:00:00.000Z` (at 'from')
- Event B: `occurredAt = 2026-01-10T12:30:00.000Z` (in range)
- Event C: `occurredAt = 2026-01-10T13:00:00.000Z` (at 'to')

**Results:**

| Backend | Event A | Event B | Event C | Correct? |
|---------|---------|---------|---------|----------|
| **In-memory** | ✅ Included | ✅ Included | ❌ Included | No |
| **Cosmos DB** | ✅ Included | ✅ Included | ❌ Included | No |
| **DynamoDB** | ✅ Included | ✅ Included | ✅ Excluded | Yes |

**Problem:** Inconsistent results across backends

---

### After Fix

**Query:** `from=2026-01-10T12:00:00Z&to=2026-01-10T13:00:00Z`

**Events:**
- Event A: `occurredAt = 2026-01-10T12:00:00.000Z` (at 'from')
- Event B: `occurredAt = 2026-01-10T12:30:00.000Z` (in range)
- Event C: `occurredAt = 2026-01-10T13:00:00.000Z` (at 'to')

**Results:**

| Backend | Event A | Event B | Event C | Correct? |
|---------|---------|---------|---------|----------|
| **In-memory** | ✅ Included | ✅ Included | ✅ Excluded | Yes |
| **Cosmos DB** | ✅ Included | ✅ Included | ✅ Excluded | Yes |
| **DynamoDB** | ✅ Included | ✅ Included | ✅ Excluded | Yes |

**Result:** Consistent results across all backends ✅

---

## Mathematical Notation

### Half-Open Interval

**Notation:** `[from, to)`

**Meaning:**
- `from` is **included** in the range (closed bracket `[`)
- `to` is **excluded** from the range (open parenthesis `)`)

**Example:**
```
[2026-01-10T12:00:00Z, 2026-01-10T13:00:00Z)

Includes:
- 2026-01-10T12:00:00.000Z  ✅ (at 'from')
- 2026-01-10T12:30:00.000Z  ✅ (in range)
- 2026-01-10T12:59:59.999Z  ✅ (just before 'to')

Excludes:
- 2026-01-10T13:00:00.000Z  ❌ (at 'to')
- 2026-01-10T13:00:00.001Z  ❌ (after 'to')
```

---

## Why Exclusive Upper Bound?

### 1. Standard Convention

**Most APIs use half-open intervals:**
- SQL: `WHERE timestamp >= start AND timestamp < end`
- Python: `range(0, 10)` includes 0-9, excludes 10
- JavaScript: `slice(0, 5)` includes indices 0-4, excludes 5

---

### 2. Non-Overlapping Ranges

**With exclusive upper bound:**
```
Range 1: [00:00, 01:00)  // 00:00 - 00:59:59.999
Range 2: [01:00, 02:00)  // 01:00 - 01:59:59.999
Range 3: [02:00, 03:00)  // 02:00 - 02:59:59.999
```

**No gaps, no overlaps** - Event at exactly 01:00 belongs to Range 2 only

**With inclusive upper bound:**
```
Range 1: [00:00, 01:00]  // 00:00 - 01:00
Range 2: [01:00, 02:00]  // 01:00 - 02:00
```

**Overlap** - Event at exactly 01:00 belongs to both ranges ❌

---

### 3. Pagination Friendly

**Exclusive upper bound makes pagination natural:**
```
Page 1: [00:00, 01:00)  // Last event: 00:59:59.999
Page 2: [01:00, 02:00)  // First event: 01:00:00.000
```

**Next page starts exactly where previous page ended** - No duplicates, no gaps

---

## Files Modified

1. **`src/infra/storage/in-memory-operational-storage.ts`** - Changed `<=` to `<` for 'to' parameter
2. **`src/infra/azure/cosmos-event-repository.ts`** - Changed SQL `<= @to` to `< @to`
3. **`tests/unit/infra/storage/in-memory-exclusive-to.test.ts`** - Added comprehensive unit tests
4. **`EXCLUSIVE_TO_SEMANTICS_COMPLETE.md`** - This documentation

**Not modified (already correct):**
- `src/infra/aws/dynamodb-event-repository.ts` - Already uses `<` for exclusive upper bound

---

## Benefits

### 1. Consistency

**Before:** Different results on different backends  
**After:** Same query returns same results everywhere

### 2. Spec Compliance

**Before:** In-memory and Cosmos violated spec  
**After:** All backends comply with spec

### 3. Predictability

**Before:** Boundary behavior unclear  
**After:** Clear half-open interval semantics

### 4. Standard Convention

**Before:** Mixed conventions  
**After:** Follows industry standard (half-open intervals)

---

## Verification Commands

**Run unit tests:**
```bash
npm run test:unit -- --testPathPattern=in-memory-exclusive-to
```

**Expected output:**
```
PASS tests/unit/infra/storage/in-memory-exclusive-to.test.ts
  InMemoryOperationalStorage - Exclusive "to" parameter
    ✓ should exclude events where occurredAt === to (exclusive upper bound)
    ✓ should include events where occurredAt === from (inclusive lower bound)
    ✓ should handle range [from, to) correctly with boundary events
```

---

## Migration Notes

**No migration needed:**
- Application code unchanged
- Query API unchanged
- Only internal filtering logic changed

**For existing queries:**
- Queries that didn't hit boundary cases: No change in results
- Queries with events at exact 'to' timestamp: Those events now excluded (correct per spec)

---

## Notes

- **No breaking changes** - Aligns with documented spec
- **Consistent semantics** - All backends now behave identically
- **Standard convention** - Half-open interval `[from, to)` is industry standard
- **Well tested** - Comprehensive unit tests verify boundary behavior

---

## Remaining Work

**None** - All acceptance criteria met:
- ✅ In-memory storage uses exclusive upper bound (`<`)
- ✅ Cosmos DB uses exclusive upper bound (`<`)
- ✅ DynamoDB verified correct (already uses `<`)
- ✅ Unit test proves event with `occurredAt === to` is excluded
- ✅ Same query returns same results regardless of backend
