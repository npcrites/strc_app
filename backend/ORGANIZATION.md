# Backend Folder Organization

## Root Level Files

These files belong at the root of the `backend/` directory:

### Configuration Files
- **`.env`** - Environment variables (gitignored, never commit)
- **`.env.example`** - Template for environment variables (committed)
- **`alembic.ini`** - Alembic migration configuration (must be at root)
- **`requirements.txt`** - Python dependencies

### Deployment Files
- **`Dockerfile`** - Docker container definition
- **`.gitignore`** - Git ignore rules

### Documentation
- **`README.md`** - Backend setup and usage guide

## Why This Organization?

### `.env` and `.env.example`
- `.env` contains actual secrets and is gitignored
- `.env.example` is a template showing required variables
- Both at root for easy access and standard convention

### `alembic.ini`
- Alembic requires this file at the project root
- References `app/db/migrations` for migration scripts
- Cannot be moved without breaking Alembic

### `requirements.txt`
- Standard Python convention at project root
- Easy to find and reference
- Works with `pip install -r requirements.txt`

### `Dockerfile`
- Container definition at root is standard practice
- Easy to reference in CI/CD pipelines
- Clear separation from application code

## File Locations Summary

```
backend/
├── .env                    # Local secrets (gitignored)
├── .env.example            # Template (committed)
├── .gitignore              # Git rules
├── alembic.ini             # Alembic config (must be at root)
├── Dockerfile              # Container definition
├── requirements.txt        # Dependencies
├── README.md               # Documentation
└── [app/, scripts/, tests/] # Code directories
```

## Best Practices

1. **Never commit `.env`** - Use `.env.example` as template
2. **Keep `alembic.ini` at root** - Required by Alembic
3. **Update `.env.example`** when adding new env vars
4. **Document in README.md** - Keep setup instructions current
