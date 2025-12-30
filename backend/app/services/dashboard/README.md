# Dashboard Service

Financial dashboard service for portfolio aggregation and analytics.

## Architecture

Three-layer separation:
1. **Queries** → Database access layer
2. **Calculators** → Pure math functions (no DB)
3. **Service** → Orchestration and DTO assembly

## Structure

```
app/services/dashboard/
├── __init__.py
├── dashboard_service.py          # Main orchestrator
├── models/
│   ├── __init__.py
│   ├── dashboard_models.py       # Response DTOs (Pydantic)
│   └── time_range.py             # TimeRange value object
├── calculators/
│   ├── __init__.py
│   ├── totals.py                 # Current value + deltas
│   ├── performance.py            # Time series + returns
│   └── allocation.py             # Asset grouping + composition
├── queries/
│   ├── __init__.py
│   ├── positions.py              # Position snapshots
│   ├── dividends.py              # Dividend history
│   └── activity.py               # Transaction history (placeholder)
└── tests/
    ├── test_calculators.py       # Unit tests (no DB)
    ├── test_service.py           # Integration (mocked queries)
    └── test_e2e.py               # End-to-end
```

## API Endpoint

```
GET /api/dashboard/snapshot?time_range=1M
```

**Query Parameters:**
- `time_range`: One of `1M`, `3M`, `1Y`, `ALL` (default: `1M`)

**Response:**
```json
{
  "as_of": "2025-01-15T12:00:00Z",
  "total": {
    "current": 50000.0,
    "start": 45000.0,
    "delta": {
      "absolute": 5000.0,
      "percent": 11.11
    }
  },
  "performance": {
    "series": [
      {"timestamp": "2024-12-15T00:00:00Z", "value": 45000.0},
      {"timestamp": "2025-01-15T00:00:00Z", "value": 50000.0}
    ],
    "delta": {"absolute": 5000.0, "percent": 11.11},
    "max": 51000.0,
    "min": 44000.0
  },
  "allocation": [
    {"asset_type": "preferred_stock", "value": 30000.0, "percent": 60.0},
    {"asset_type": "common_stock", "value": 20000.0, "percent": 40.0}
  ]
}
```

## Features

### TimeRange Value Object
- Supports shorthand: `1M`, `3M`, `1Y`, `ALL`
- Validates date ranges
- Prevents future projections

### Query Layer
- Efficient position snapshot retrieval
- Handles historical data correctly
- Groups by timestamp for daily aggregates

### Calculator Layer
- **TotalsCalculator**: Portfolio value aggregation and deltas
- **PerformanceCalculator**: Time series and performance metrics
- **AllocationCalculator**: Asset type grouping and percentages

### Edge Cases Handled
- Empty portfolio
- Zero start value
- Negative returns
- Missing asset types
- No historical data

## Testing

```bash
# Run all dashboard tests
pytest app/services/dashboard/tests/ -v

# Run specific test suite
pytest app/services/dashboard/tests/test_calculators.py -v
pytest app/services/dashboard/tests/test_service.py -v
pytest app/services/dashboard/tests/test_e2e.py -v
```

**Test Coverage:**
- ✅ 10 calculator unit tests (pure functions)
- ✅ 4 service integration tests (mocked)
- ✅ 3 end-to-end tests (with database)

## Design Principles

1. **Separation of Concerns**: Queries, calculators, and service are independent
2. **Testability**: Pure functions in calculators, mockable queries
3. **Future-Proof**: Easy to add caching, async, or new metrics
4. **Type Safety**: Pydantic models for all DTOs
5. **Edge Case Handling**: Graceful handling of empty data, zero values, etc.

## Performance Considerations

- Queries use indexed `snapshot_timestamp` and `user_id`
- Calculators are pure Python (can be cached or parallelized)
- Service layer returns cacheable DTOs
- TimeRange supports precomputation of common ranges

## Future Enhancements

- Add Redis caching layer
- Support custom date ranges
- Add dividend income metrics
- Transaction activity tracking
- Async database queries for scale

