import { Business, Category } from '@shared/schema';

// Predefined categories with their icons
const PREDEFINED_CATEGORIES: Category[] = [
  {
    id: 'retail',
    name: 'Retail Products',
    icon: '🛍️',
    description: 'Retail Products'
  },
  {
    id: 'street-vendors',
    name: 'Street & Mobile Vendors',
    icon: '🛒',
    description: 'Mobile and street-based vendors'
  },
  {
    id: 'creative',
    name: 'Creative Industry & Branding',
    icon: '🎨',
    description: 'Creative and branding services'
  },
  {
    id: 'skilled-trades',
    name: 'Skilled Trades & Construction',
    icon: '🔧',
    description: 'Construction and skilled trade services'
  },
  {
    id: 'agriculture',
    name: 'Agriculture & Farming',
    icon: '🐐',
    description: 'Agricultural and farming businesses'
  },
  {
    id: 'transport',
    name: 'Transport & Logistics',
    icon: '🚚',
    description: 'Transportation and logistics services'
  },
  {
    id: 'repairs',
    name: 'Repairs & Electronics',
    icon: '📲',
    description: 'Electronics repair and maintenance services'
  },
  {
    id: 'services',
    name: 'Service Providers',
    icon: '🧽',
    description: 'Various service providers'
  },
  {
    id: 'beauty-products',
    name: 'Beauty & Personal Care',
    icon: '🧴',
    description: 'Beauty and skincare products'
  },
  {
    id: 'education',
    name: 'Education & Training',
    icon: '📚',
    description: 'Educational and training services'
  },
  {
    id: 'social',
    name: 'Social Enterprise & Community Builders',
    icon: '🌍',
    description: 'Social enterprises and community services'
  },
  {
    id: 'security',
    name: 'Security Services',
    icon: '🛡️',
    description: 'Security and protection services'
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy & Health Supplies',
    icon: '💊',
    description: 'Pharmacy and health supplies'
  },
  {
    id: 'health',
    name: 'Private Health & Medical Services',
    icon: '🩺',
    description: 'Private health and medical services'
  },
  {
    id: 'food-retail',
    name: 'Food & Grocery Retailers',
    icon: '🛒',
    description: 'Food and grocery retail stores'
  },
  {
    id: 'travel',
    name: 'Travel & Tourism Services',
    icon: '🌍',
    description: 'Travel and tourism services'
  },
  {
    id: 'quick-food',
    name: 'Fast food & Takeaway Food Services',
    icon: '🍔',
    description: 'Quick food and takeaway services'
  },
  {
    id: 'grooming',
    name: 'Hair, Beauty, Grooming Services and Personal Care',
    icon: '💈',
    description: 'Hair, beauty, grooming and personal care services'
  },
  {
    id: 'hardware',
    name: 'Hardware, Tools & Home Improvement',
    icon: '🧱',
    description: 'Hardware and home improvement supplies'
  },
  {
    id: 'plant_garden',
    name: 'Plants',
    icon: '🌱',
    description: 'live plants and gardening products'
  },
  {
    id: 'home_decor',
    name: '🏠 Home Textiles & Décor Sellers',
    icon: '🏠',
    description: 'Entrepreneurs selling fabric-based items for home comfort and style'
  },
  {
    id: 'school_gear',
    name: '🎒 School & Personal Gear Sellers',
    icon: '🎒',
    description: 'Entrepreneurs offering bags, bottles, and everyday carry items for students and families'
  },
  {
    id: 'beauty_skincare',
    name: '🧖‍♀️ Natural Beauty & Skincare Products',
    icon: '🧖‍♀️',
    description: 'Entrepreneurs crafting and selling handmade or small-batch personal care items'
  }
];

// Category service for managing categories
export const CategoryService = {
  /**
   * Get all available categories
   * @returns Array of categories
   */
  getCategories(): Category[] {
    // Get all businesses
    const businesses = JSON.parse(localStorage.getItem('businesses') || '[]');
    
    // Get unique categories from businesses
    const usedCategories = new Set(businesses.map((business: Business) => business.category?.toLowerCase()).filter(Boolean));
    
    // Filter predefined categories to only include those that are used
    return PREDEFINED_CATEGORIES.filter(category => 
      usedCategories.has(category.id.toLowerCase())
    );
  },

  /**
   * Get a category by its ID
   * @param id Category ID
   * @returns Category object or undefined if not found
   */
  getCategoryById(id: string): Category | undefined {
    return PREDEFINED_CATEGORIES.find(category => category.id === id);
  },

  /**
   * Get a category by its name
   * @param name Category name
   * @returns Category object or undefined if not found
   */
  getCategoryByName(name: string): Category | undefined {
    return PREDEFINED_CATEGORIES.find(
      category => category.name.toLowerCase() === name.toLowerCase()
    );
  },

  /**
   * Sort categories by name
   * @param categories Array of categories to sort
   * @param direction Sort direction ('asc' or 'desc')
   * @returns Sorted array of categories
   */
  sortCategoriesByName(categories: Category[], direction: 'asc' | 'desc' = 'asc'): Category[] {
    return [...categories].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return direction === 'asc' ? comparison : -comparison;
    });
  },

  /**
   * Filter businesses by category
   * @param businesses Array of businesses to filter
   * @param categoryId Category ID to filter by
   * @returns Filtered array of businesses
   */
  filterBusinessesByCategory(businesses: Business[], categoryId: string): Business[] {
    if (!categoryId) {
      return businesses;
    }
    
    return businesses.filter((business: Business) => {
      // If the business has no category, include it in 'other'
      if (!business.category && categoryId === 'other') {
        return true;
      }
      
      // Match by category ID
      return business.category?.toLowerCase() === categoryId.toLowerCase();
    });
  },

  /**
   * Get all businesses grouped by category
   * @param businesses Array of all businesses
   * @returns Object with category IDs as keys and arrays of businesses as values
   */
  getBusinessesByCategory(businesses: Business[]): Record<string, Business[]> {
    const result: Record<string, Business[]> = {};
    
    // Initialize with empty arrays for all categories
    PREDEFINED_CATEGORIES.forEach(category => {
      result[category.id] = [];
    });
    
    // Group businesses by category
    businesses.forEach(business => {
      const categoryId = business.category?.toLowerCase() || 'other';
      
      // If this category exists in our predefined list
      if (result[categoryId]) {
        result[categoryId].push(business);
      } else {
        // If not, add to 'other'
        result['other'].push(business);
      }
    });
    
    return result;
  }
};