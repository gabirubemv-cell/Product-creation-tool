import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import '@shopify/shopify-api/adapters/node';
import { shopifyApi, Session } from '@shopify/shopify-api';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Shopify
const shopify = shopifyApi({
  apiKey: 'dummy', // Not needed for Admin API access token
  apiSecretKey: 'dummy', // Not needed for Admin API access token
  scopes: ['write_products', 'read_products'],
  hostName: process.env.SHOPIFY_STORE_URL,
  apiVersion: '2024-01',
  isEmbeddedApp: false,
});

const session = new Session({
  id: 'offline_session',
  shop: process.env.SHOPIFY_STORE_URL,
  state: 'state',
  isOnline: false,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
});

const client = new shopify.clients.Rest({ session });

// Product name templates by collection type
const productTemplates = {
  'Apparel': [
    'Classic {adjective} {item}',
    'Premium {adjective} {item}',
    'Vintage {adjective} {item}',
    'Modern {adjective} {item}',
    'Essential {adjective} {item}'
  ],
  'Accessories': [
    '{adjective} {item}',
    'Designer {adjective} {item}',
    'Luxury {adjective} {item}',
    'Handcrafted {adjective} {item}'
  ]
};

const adjectives = ['Elegant', 'Stylish', 'Comfortable', 'Trendy', 'Classic', 'Bold', 'Minimalist', 'Sophisticated'];
const apparelItems = ['T-Shirt', 'Hoodie', 'Jacket', 'Sweater', 'Shirt', 'Pants', 'Jeans', 'Dress'];
const accessoryItems = ['Belt', 'Hat', 'Scarf', 'Bag', 'Watch', 'Sunglasses', 'Wallet'];

// Generate random value in range
function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate random element from array
function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Generate product name
function generateProductName(collectionType) {
  const templates = productTemplates[collectionType] || productTemplates['Apparel'];
  const template = randomElement(templates);
  const adjective = randomElement(adjectives);
  const items = collectionType === 'Accessories' ? accessoryItems : apparelItems;
  const item = randomElement(items);

  return template.replace('{adjective}', adjective).replace('{item}', item);
}

// Generate product description
function generateDescription(productName, collection) {
  const descriptions = [
    `Discover the perfect blend of style and comfort with our ${productName}. Crafted with premium materials and attention to detail, this piece is designed to elevate your wardrobe.`,
    `Introducing the ${productName} from our ${collection.name}. This versatile piece combines timeless design with modern functionality, making it a must-have addition to your collection.`,
    `Experience luxury with the ${productName}. Made with high-quality materials and expert craftsmanship, this item offers both style and durability for everyday wear.`,
    `The ${productName} is the epitome of contemporary fashion. Designed for those who appreciate quality and style, this piece seamlessly fits into any wardrobe.`
  ];

  return randomElement(descriptions);
}

// Generate SEO-friendly handle
function generateHandle(productName) {
  return productName.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Generate AI Image
async function generateProductImage(productName, description) {
  if (!config.useAIImages) return config.imagePlaceholder;

  console.log(`   🎨 Generating AI image for "${productName}"...`);
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Professional product photography of ${productName} displayed on a headless mannequin. ${description}. Warm beige background, soft studio lighting with natural shadows, high resolution, minimalist warm aesthetic.`,
      n: 1,
      size: "1024x1024",
    });
    return response.data[0].url;
  } catch (error) {
    console.error(`   ⚠️ Failed to generate image: ${error.message}`);
    return config.imagePlaceholder;
  }
}

// Upload to Shopify
async function uploadProductToShopify(productData, variants) {
  if (!config.enableShopifyUpload) return;

  console.log(`   ⬆️ Uploading "${productData.title}" to Shopify...`);
  try {
    const response = await client.post({
      path: 'products',
      data: {
        product: {
          title: productData.title,
          body_html: productData.body_html,
          vendor: productData.vendor,
          product_type: productData.product_type,
          tags: productData.tags,
          status: 'active',
          images: productData.images,
          variants: variants.map(v => ({
            option1: v.option1,
            price: v.price,
            sku: v.sku,
            inventory_management: 'shopify',
            inventory_quantity: v.inventory_quantity,
            requires_shipping: true,
            taxable: true
          })),
          options: [{ name: "Size", values: variants.map(v => v.option1) }]
        }
      },
      type: 'application/json',
    });

    console.log(`   ✅ Uploaded successfully! ID: ${response.body.product.id}`);
  } catch (error) {
    console.error(`   ❌ Failed to upload to Shopify: ${error.message}`);
    if (error.response) {
      console.error(`   Details: ${JSON.stringify(error.response.body)}`);
    }
  }
}

// Generate CSV row
function generateCSVRow(data) {
  return data.map(field => {
    const stringField = String(field ?? '');
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
  }).join(',');
}

// Main generator function
async function generateProducts() {
  console.log('🚀 Starting Shopify Product Generator...\n');

  const products = [];
  const productsPerCollection = Math.ceil(config.productCount / config.collections.length);

  for (const collection of config.collections) {
    if (products.length >= config.productCount) break;

    const count = Math.min(productsPerCollection, config.productCount - products.length);
    console.log(`📦 Generating ${count} products for "${collection.name}"...`);

    for (let i = 0; i < count; i++) {
      const productName = generateProductName(collection.type);
      const handle = generateHandle(productName);
      const description = generateDescription(productName, collection);
      const price = randomInRange(config.pricing.min, config.pricing.max);
      const tags = collection.tags.join(', ');

      // Generate Image
      const imageUrl = await generateProductImage(productName, description);

      const productVariants = [];

      // Generate variants for each size
      config.variants.sizes.forEach((size, variantIndex) => {
        const sku = `${handle.toUpperCase()}-${size}`.substring(0, 30);
        const stock = randomInRange(config.stock.min, config.stock.max);
        const isFirstVariant = variantIndex === 0;

        // Add to CSV list
        products.push({
          handle: handle,
          title: isFirstVariant ? productName : '',
          body: isFirstVariant ? description : '',
          vendor: isFirstVariant ? config.vendor : '',
          type: isFirstVariant ? collection.type : '',
          tags: isFirstVariant ? tags : '',
          published: isFirstVariant ? 'TRUE' : '',
          option1Name: isFirstVariant ? 'Size' : '',
          option1Value: size,
          option2Name: '',
          option2Value: '',
          option3Name: '',
          option3Value: '',
          variantSKU: sku,
          variantGrams: randomInRange(200, 800),
          variantInventoryTracker: 'shopify',
          variantInventoryQty: stock,
          variantInventoryPolicy: 'deny',
          variantFulfillmentService: 'manual',
          variantPrice: price,
          variantCompareAtPrice: price + randomInRange(10, 30),
          variantRequiresShipping: 'TRUE',
          variantTaxable: 'TRUE',
          variantBarcode: '',
          imageSrc: isFirstVariant ? imageUrl : '',
          imagePosition: isFirstVariant ? '1' : '',
          imageAltText: isFirstVariant ? productName : '',
          giftCard: 'FALSE',
          seoTitle: isFirstVariant ? productName : '',
          seoDescription: isFirstVariant ? description.substring(0, 160) : '',
          variantImage: '',
          variantWeightUnit: 'g',
          variantTaxCode: '',
          costPerItem: Math.round(price * 0.4 * 100) / 100,
          status: 'active'
        });

        productVariants.push({
          option1: size,
          price: price,
          sku: sku,
          inventory_quantity: stock
        });
      });

      // Upload to Shopify
      if (config.enableShopifyUpload) {
        await uploadProductToShopify({
          title: productName,
          body_html: description,
          vendor: config.vendor,
          product_type: collection.type,
          tags: tags,
          images: [{ src: imageUrl }]
        }, productVariants);
      }
    }
  }

  console.log(`\n✅ Generated ${products.length} product variants (${config.productCount} unique products)\n`);

  // Create CSV
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
    'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
    'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price',
    'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description',
    'Variant Image', 'Variant Weight Unit', 'Variant Tax Code', 'Cost per item', 'Status'
  ];

  const csvRows = [generateCSVRow(headers)];

  products.forEach(product => {
    csvRows.push(generateCSVRow([
      product.handle, product.title, product.body, product.vendor, product.type, product.tags, product.published,
      product.option1Name, product.option1Value, product.option2Name, product.option2Value, product.option3Name, product.option3Value,
      product.variantSKU, product.variantGrams, product.variantInventoryTracker, product.variantInventoryQty,
      product.variantInventoryPolicy, product.variantFulfillmentService, product.variantPrice,
      product.variantCompareAtPrice, product.variantRequiresShipping, product.variantTaxable, product.variantBarcode,
      product.imageSrc, product.imagePosition, product.imageAltText, product.giftCard, product.seoTitle, product.seoDescription,
      product.variantImage, product.variantWeightUnit, product.variantTaxCode, product.costPerItem, product.status
    ]));
  });

  const csv = csvRows.join('\n');
  const outputPath = path.join(__dirname, 'products.csv');
  fs.writeFileSync(outputPath, csv, 'utf8');

  console.log('📄 CSV file generated successfully!');
  console.log(`📍 Location: ${outputPath}`);
  console.log(`\n📊 Summary:`);
  console.log(`   - Total products: ${config.productCount}`);
  console.log(`   - Total variants: ${products.length}`);
  console.log(`   - Collections: ${config.collections.length}`);
  console.log(`   - Sizes per product: ${config.variants.sizes.length}`);
  console.log(`\n🎉 Ready to upload to Shopify!\n`);
}

// Run generator
try {
  generateProducts();
} catch (error) {
  console.error('❌ Error generating products:', error.message);
  process.exit(1);
}
