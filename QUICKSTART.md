# Quick Start Guide

## Step 1: Install Node.js (If Not Already Installed)

1. Go to https://nodejs.org/en/download
2. Download the **LTS version** Windows Installer (.msi)
3. Run the installer and follow the prompts
4. **Important**: Close and reopen PowerShell after installation

## Step 2: Verify Installation

Open a **new** PowerShell window and run:
```bash
node --version
npm --version
```

You should see version numbers displayed.

## Step 3: Generate Products

Navigate to your project folder and run:
```bash
cd "c:\Users\g-rub\OneDrive\Documentos\Projects\Project 1"
node generate-products.js
```

Or use npm:
```bash
npm run generate
```

## Step 4: Customize (Optional)

Edit `config.json` to change:
- Number of products
- Collections and tags
- Price ranges
- Stock quantities
- Product types

## Step 5: Upload to Shopify

1. Log in to your Shopify admin
2. Go to **Products** → **Import**
3. Upload the generated `products.csv` file
4. Review and confirm

---

**Need help?** Check the full [README.md](file:///c:/Users/g-rub/OneDrive/Documentos/Projects/Project 1/README.md) for detailed documentation.
