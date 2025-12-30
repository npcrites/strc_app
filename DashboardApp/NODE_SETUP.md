# Node.js & npm Setup Guide

## Installation Options for macOS

### Option 1: Install via Homebrew (Recommended)

If you have Homebrew installed:

```bash
# Install Node.js (includes npm)
brew install node

# Verify installation
node --version
npm --version
```

### Option 2: Install via Homebrew (if you don't have Homebrew)

First install Homebrew:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install Node.js:
```bash
brew install node
```

### Option 3: Direct Download

1. Visit [nodejs.org](https://nodejs.org/)
2. Download the LTS (Long Term Support) version for macOS
3. Run the installer
4. Restart your terminal

### Option 4: Using nvm (Node Version Manager)

If you want to manage multiple Node.js versions:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or run:
source ~/.zshrc

# Install latest LTS Node.js
nvm install --lts
nvm use --lts

# Verify
node --version
npm --version
```

## Verify Installation

After installation, verify in a new terminal:

```bash
node --version   # Should show v18.x.x or higher
npm --version    # Should show 9.x.x or higher
```

## Next Steps

Once Node.js is installed:

```bash
cd DashboardApp
npm install
npm start
```

## Troubleshooting

**If commands still not found after installation:**
1. Close and reopen your terminal
2. Check your PATH: `echo $PATH`
3. For Homebrew, you may need to add to PATH:
   ```bash
   echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
   source ~/.zshrc
   ```

**For Expo CLI:**
```bash
npm install -g expo-cli
```

