import { Business, Product } from "@shared/schema";

// Add hashCode extension for string to match Dart functionality
declare global {
  interface String {
    hashCode: number;
  }
}

Object.defineProperty(String.prototype, 'hashCode', {
  get: function() {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
      const char = this.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
});

// Exact URL from the CSV file
const PROFILE_SHEET_URL = 
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2ozY2amP92pxMxyTIuvJsZYegfd69941Ic-RDTmfl-xi-yADUws_v6Qyyda34vM6jnoOaIrJ-00gH/pub?output=csv';

let businessCache: Business[] = [];
let productCache: Map<string, Map<string, Product[]>> = new Map();

// Function to clear the business cache
export function clearBusinessCache(): void {
  businessCache = [];
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.removeItem('businesses');
  }
  console.log('Business cache cleared');
}

// Function to clear the product cache
export function clearProductCache(): void {
  productCache = new Map();
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    // Clear all product cache entries
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('products_')) {
        localStorage.removeItem(key);
      }
    });
  }
  console.log('Product cache cleared');
}

// Function to clear all caches
export function clearAllCaches(): void {
  clearBusinessCache();
  clearProductCache();
  console.log('All caches cleared');
}

async function testDirectImageUrl(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const directUrl = getDirectImageUrl(url);

    
    const response = await fetch(directUrl, { 
      method: 'HEAD',
      mode: 'no-cors' // Handle CORS issues
    });
    return response.ok;
  } catch (e) {
    console.warn('Failed to test image URL:', url, 'Error:', e);
    
    // Try alternative method - attempt to load as image
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = getDirectImageUrl(url);
      
      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  }
}


function productFromCsv(row: string[]): Product {
  console.log('Raw row values:', {
    name: row[0],
    category: row[1],
    price: row[2],
    description: row[3],
    inStock: row[4],
    mainImage: row[5],
    additionalImage1: row[6],
    additionalImage2: row[7]
  });

  const imageUrl = row[5] ? getDirectImageUrl(row[5]) : '';
  const additionalImageUrls = [
    row[6] ? getDirectImageUrl(row[6]) : '',
    row[7] ? getDirectImageUrl(row[7]) : ''
  ].filter(url => url !== '');

  console.log('Processed image URLs:', {
    imageUrl,
    additionalImageUrls
  });
  
  return {
    id: `${row[0]}-${row[1]}`.toLowerCase().replace(/\s+/g, '_'),
    name: row[0] || '',
    category: row[1] || 'Other',
    price: parseFloat(row[2]) || 0,
    description: row[3] || '',
    imageUrl: imageUrl,
    additionalImageUrls: additionalImageUrls,
    inStock: row[4]?.toLowerCase() === 'in stock'
  };
}

function parseProductsCSV(csvText: string): Map<string, Product[]> {
  // Remove BOM if present
  csvText = csvText.replace(/^\uFEFF/, '');
  const rows = parseCSV(csvText);
  const products = new Map<string, Product[]>();
  
  console.log('Total rows in CSV:', rows.length);
  
  // Skip header row (index 0) and process all data rows
  for (let i = 1; i < rows.length; i++) {
    try {
      const row = rows[i];
      if (row.length < 8) { // Minimum required columns for all images
        console.warn(`Row ${i} skipped: Insufficient columns (${row.length}/8):`, row);
        continue;
      }
      const product = productFromCsv(row);
      
      if (!products.has(product.category)) {
        products.set(product.category, []);
      }
      products.get(product.category)!.push(product);
      console.log(`Row ${i} processed:`, {
        name: product.name,
        imageUrl: product.imageUrl,
        additionalImageUrls: product.additionalImageUrls
      });
    } catch (e) {
      console.warn('Failed to parse product row:', rows[i], e);
    }
  }
  
  return products;
}

async function loadBusinessesFromLocal(): Promise<Business[]> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const cached = localStorage.getItem('businesses');
    if (cached) {
      const businesses = JSON.parse(cached) as Business[];
      return businesses.filter(business => business.status.toLowerCase() === 'active');
    }
  } catch (e) {
    console.warn('Error loading from localStorage:', e);
  }
  return [];
}

async function saveBusinessesToLocal(businesses: Business[]): Promise<void> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem('businesses', JSON.stringify(businesses));
  } catch (e) {
    console.warn('Error saving to localStorage:', e);
  }
}

function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < csvText.length) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && i + 1 < csvText.length && csvText[i + 1] === '"') {
        // Escaped quote
        currentField += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
    } else if ((char === '\r' && i + 1 < csvText.length && csvText[i + 1] === '\n') || char === '\n') {
      if (!inQuotes) {
        currentRow.push(currentField.trim());
        if (currentRow.length > 0) {
          rows.push([...currentRow]);
          currentRow = [];
        }
        currentField = '';
        i += (char === '\r' ? 2 : 1);
      } else {
        currentField += char === '\r' ? '\r\n' : '\n';
        i += (char === '\r' ? 2 : 1);
      }
    } else {
      currentField += char;
      i++;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
}

function businessFromCsv(row: string[]): Business {
  const profilePictureUrl = row[10] || '';
  
  return {
    id: row[0].toLowerCase().replace(/\s+/g, '_'),
    name: row[0] || '',
    ownerName: row[1] || '',
    address: row[2] || '',
    phoneNumber: row[3] || '',
    whatsAppNumber: row[4] || '',
    emailAddress: row[5] || '',
    hasDelivery: (row[6] || '').toLowerCase() === 'yes',
    deliveryArea: row[7] || '',
    operationHours: row[8] || '',
    specialHours: row[9] || '',
    profilePictureUrl: profilePictureUrl,
    productSheetUrl: row[11] || '',
    status: (row[12] || '').toLowerCase(),
    bio: row[13] || '',
    mapLocation: row.length > 14 ? row[14] || '' : '',
    deliveryCost: row.length > 15 ? parseFloat(row[15]) || null : null,
    islandWideDelivery: row.length > 16 ? row[16] || '' : '',
    islandWideDeliveryCost: row.length > 17 ? parseFloat(row[17]) || null : null,
    category: row.length > 18 ? row[18] || '' : '',
    profileType: row.length > 19 ? (row[19]?.toLowerCase() === 'product_listing' ? 'product_listing' : 
                                   row[19]?.toLowerCase() === 'product_inquiry' ? 'product_inquiry' : 'product_sales') : 'product_sales'
  };
}

function parseBusinessesCSV(csvText: string): Business[] {
  // Remove BOM if present
  csvText = csvText.replace(/^\uFEFF/, '');
  const rows = parseCSV(csvText);
  const businesses: Business[] = [];
  
  // Skip header row (index 0) and process all data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    
    if (row.length >= 14) { // Minimum required columns
      try {
        const business = businessFromCsv(row);
        const status = business.status.toLowerCase();
        
        // Include both active and coming soon businesses
        const isVisible = (status === 'active' || status === 'coming_soon') &&
                         business.profilePictureUrl.length > 0 &&
                         business.name.length > 0;
        
        if (isVisible) {
          businesses.push(business);
        }
      } catch (e) {
        console.warn('Failed to parse business row:', row, e);
      }
    }
  }
  
  return businesses;
}

async function fetchBusinessesFromNetwork(): Promise<Business[]> {
  try {
    console.log('Fetching businesses from:', PROFILE_SHEET_URL);
    const response = await fetch(PROFILE_SHEET_URL, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv, text/plain, */*',
      }
    });
    
    if (!response.ok) {
      console.error('Fetch response not ok:', response.status, response.statusText);
      throw new Error(`Failed to load businesses: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();

    
    if (!csvText || csvText.trim().length === 0) {
      throw new Error('Empty response from server');
    }
    
    const businesses = parseBusinessesCSV(csvText);

    
    // Log businesses with image issues
    businesses.forEach((business) => {
      if (business.profilePictureUrl && business.profilePictureUrl.includes('drive.google.com')) {
        
      }
    });
    
    if (businesses.length === 0) {
      throw new Error('No valid businesses found in CSV data');
    }
    
    await saveBusinessesToLocal(businesses);
    businessCache = businesses;
    return businesses;
  } catch (e) {
    console.error('Error fetching businesses:', e);
    throw e;
  }
}

async function loadBusinesses(): Promise<Business[]> {
  try {
    if (businessCache && businessCache.length > 0) {
      return businessCache;
    }

    const businesses = await loadBusinessesFromLocal();
    if (businesses.length > 0) {
      businessCache = businesses;
      return businesses;
    }
  } catch (e) {
    console.warn('Failed to load businesses from local storage:', e);
  }

  try {
    return await fetchBusinessesFromNetwork();
  } catch (e) {
    console.error('Failed to fetch businesses from network:', e);
    throw e;
  }
}

async function loadProductsFromLocal(productSheetUrl: string): Promise<Map<string, Product[]>> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return new Map();
  }
  try {
    const cacheKey = `products_${btoa(productSheetUrl)}`;
    console.log('Checking local storage with cache key:', cacheKey);
    
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      console.log('Found cached products data');
      const productsObj = JSON.parse(cached);
      const products = new Map<string, Product[]>();
      
      Object.entries(productsObj).forEach(([category, items]) => {
        products.set(category, items as Product[]);
      });
      
      console.log('Loaded from cache:', {
        categories: Array.from(products.keys()),
        totalProducts: Array.from(products.values()).reduce((sum, arr) => sum + arr.length, 0)
      });
      
      return products;
    } else {
      console.log('No cached products found');
    }
  } catch (e) {
    console.warn('Error loading products from localStorage:', e);
  }
  return new Map();
}

async function saveProductsToLocal(productSheetUrl: string, products: Map<string, Product[]>): Promise<void> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    const cacheKey = `products_${btoa(productSheetUrl)}`;
    const productsObj = Object.fromEntries(products);
    localStorage.setItem(cacheKey, JSON.stringify(productsObj));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
  } catch (e) {
    console.warn('Error saving products to localStorage:', e);
  }
}

async function fetchProductsFromNetwork(productSheetUrl: string): Promise<Map<string, Product[]>> {
  try {
    console.log('Fetching products from:', productSheetUrl);
    const response = await fetch(productSheetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv, text/plain, */*',
      }
    });
    
    if (!response.ok) {
      console.error('Fetch response not ok:', response.status, response.statusText);
      throw new Error(`Failed to load products: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    console.log('CSV text length:', csvText.length);
    console.log('First 200 characters of CSV:', csvText.substring(0, 200));
    
    if (!csvText || csvText.trim().length === 0) {
      throw new Error('Empty response from server');
    }
    
    const products = parseProductsCSV(csvText);
    console.log('Parsed products:', {
      categories: Array.from(products.keys()),
      totalProducts: Array.from(products.values()).reduce((sum, arr) => sum + arr.length, 0)
    });
    
    await saveProductsToLocal(productSheetUrl, products);
    productCache.set(productSheetUrl, products);
    return products;
  } catch (e) {
    console.error('Error fetching products:', e);
    throw e;
  }
}

async function loadProducts(productSheetUrl: string): Promise<Map<string, Product[]>> {
  if (!productSheetUrl || productSheetUrl.trim() === '') {
    throw new Error('Product sheet URL is required');
  }

  if (productCache.has(productSheetUrl)) {
    return productCache.get(productSheetUrl)!;
  }

  try {
    const products = await loadProductsFromLocal(productSheetUrl);
    if (products.size > 0) {
      productCache.set(productSheetUrl, products);
      return products;
    }
  } catch (e) {
    console.warn('Failed to load products from local storage:', e);
  }

  try {
    return await fetchProductsFromNetwork(productSheetUrl);
  } catch (e) {
    console.error('Failed to fetch products from network:', e);
    throw e;
  }
}

function getDirectImageUrl(url: string): string {
  if (!url) return '';
  console.log('Processing URL:', url);
  
  if (url.includes('drive.google.com')) {
    // Handle different Google Drive URL formats
    let fileId = null;
    
    // Format 1: /file/d/FILE_ID/view
    let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      fileId = match[1];
      console.log('Found file ID (Format 1):', fileId);
    }
    
    // Format 2: /d/FILE_ID/view
    if (!fileId) {
      match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1];
        console.log('Found file ID (Format 2):', fileId);
      }
    }
    
    // Format 3: ?id=FILE_ID
    if (!fileId) {
      match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1];
        console.log('Found file ID (Format 3):', fileId);
      }
    }
    
    // Format 4: open?id=FILE_ID
    if (!fileId) {
      match = url.match(/open\?id=([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1];
        console.log('Found file ID (Format 4):', fileId);
      }
    }
    
    if (fileId) {
      const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
      console.log('Generated direct URL:', directUrl);
      return directUrl;
    } else {
      console.warn('Could not extract file ID from Google Drive URL:', url);
    }
  } else {
    console.log('URL is not a Google Drive URL, returning as-is');
  }
  return url;
}

export const BusinessService = {
  loadBusinesses,
  fetchBusinessesFromNetwork,
  loadProducts,
  getDirectImageUrl,
  testDirectImageUrl,
  clearBusinessCache,
  clearProductCache,
  clearAllCaches
};