# Backend Folder Organization Guide

## ✅ Current Structure (Organized)

```
backend/
├── .env                    # ⚠️  Local secrets (gitignored - NEVER commit)
├── .env.example            # ✅ Template for environment variables
├── .gitignore              # ✅ Git ignore rules
├── alembic.ini             # ✅ Alembic config (must be at root)
├── Dockerfile              # ✅ Docker container definition
├── requirements.txt        # ✅ Python dependencies
├── README.md               # ✅ Backend documentation
├── ORGANIZATION.md         # ✅ This organization guide
│
├── app/                    # Application code
│   ├── main.py
│   ├── api/
│   ├── core/
│   ├── db/
│   ├── models/
│   └── services/
│
├── scripts/                 # Utility scripts
│   └── ...
│
└── tests/                  # Test suite
    └── ...
```

## 📋 File Organization Rules

### Root Level Files (Keep Here)

| File | Purpose | Why at Root |
|------|---------|-------------|
| `.env` | Environment variables | Standard convention, easy access |
| `.env.example` | Env template | Shows required variables |
| `.gitignore` | Git ignore rules | Standard location |
| `alembic.ini` | Alembic config | **Required by Alembic** |
| `Dockerfile` | Docker config | Standard practice |
| `requirements.txt` | Dependencies | Python standard |
| `README.md` | Documentation | Easy to find |

### Why These Files Stay at Root

1. **`alembic.ini`** - Alembic requires this at project root. It references `app/db/migrations` but must be at root.

2. **`.env` and `.env.example`** - Standard convention for environment files. Easy to find and configure.

3. **`requirements.txt`** - Python standard location. Works with `pip install -r requirements.txt`.

4. **`Dockerfile`** - Container definitions are typically at project root for easy reference in CI/CD.

## 🔒 Security Notes

- ✅ `.env` is in `.gitignore` - never commit secrets
- ✅ `.env.example` is committed - shows structure without secrets
- ✅ Update `.env.example` when adding new environment variables

## 📝 Maintenance

### When Adding New Environment Variables

1. Add to `.env` (your local file)
2. Add to `.env.example` (template, no real values)
3. Update `app/core/config.py` if needed
4. Document in `README.md`

### When Adding Dependencies

1. Add to `requirements.txt`
2. Run `pip install -r requirements.txt`
3. Update `Dockerfile` if needed

## 🚀 Quick Reference

```bash
# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env with your values

# Run migrations
python3 -m alembic upgrade head

# Run server
uvicorn app.main:app --reload
```

## ✅ Organization Checklist

- [x] `.env` at root (gitignored)
- [x] `.env.example` at root (committed)
- [x] `.gitignore` at root
- [x] `alembic.ini` at root
- [x] `Dockerfile` at root
- [x] `requirements.txt` at root
- [x] `README.md` at root
- [x] No duplicate config files
- [x] Documentation updated
