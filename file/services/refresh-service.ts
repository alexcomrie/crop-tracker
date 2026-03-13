import { BusinessService } from './business-service';

class RefreshService {
  private textRefreshInterval: NodeJS.Timeout | null = null;
  private imageRefreshInterval: NodeJS.Timeout | null = null;
  private lastTextRefresh: number = 0;
  private lastImageRefresh: number = 0;

  // Constants for refresh intervals (in milliseconds)
  private readonly TEXT_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly IMAGE_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // Initialize refresh on app start
    this.refreshAll();
    
    // Set up periodic refresh intervals
    this.startPeriodicRefresh();

    // Add event listeners for app visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      
      // Check if enough time has passed since last refresh
      if (now - this.lastTextRefresh >= this.TEXT_REFRESH_INTERVAL) {
        this.refreshTextData();
      }
      
      if (now - this.lastImageRefresh >= this.IMAGE_REFRESH_INTERVAL) {
        this.refreshImageData();
      }
    }
  }

  private startPeriodicRefresh() {
    // Set up text data refresh interval
    this.textRefreshInterval = setInterval(() => {
      this.refreshTextData();
    }, this.TEXT_REFRESH_INTERVAL);

    // Set up image refresh interval
    this.imageRefreshInterval = setInterval(() => {
      this.refreshImageData();
    }, this.IMAGE_REFRESH_INTERVAL);
  }

  private async refreshTextData() {
    try {
      await BusinessService.fetchBusinessesFromNetwork();
      this.lastTextRefresh = Date.now();
      
      // Refresh products for each business
      const businesses = await BusinessService.loadBusinesses();
      for (const business of businesses) {
        if (business.productSheetUrl) {
          await BusinessService.loadProducts(business.productSheetUrl);
        }
      }
    } catch (error) {
      console.error('Failed to refresh text data:', error);
    }
  }

  private async refreshImageData() {
    try {
      const businesses = await BusinessService.loadBusinesses();
      
      // Test and update image URLs
      for (const business of businesses) {
        if (business.profilePictureUrl) {
          await BusinessService.testDirectImageUrl(business.profilePictureUrl);
        }
        
        // Load products to refresh their images
        if (business.productSheetUrl) {
          const products = await BusinessService.loadProducts(business.productSheetUrl);
          for (const categoryProducts of Array.from(products.values())) {
            for (const product of categoryProducts) {
              if (product.imageUrl) {
                await BusinessService.testDirectImageUrl(product.imageUrl);
              }
            }
          }
        }
      }
      
      this.lastImageRefresh = Date.now();
    } catch (error) {
      console.error('Failed to refresh image data:', error);
    }
  }

  public async refreshAll() {
    await this.refreshTextData();
    await this.refreshImageData();
  }

  public cleanup() {
    // Clear intervals when the service is destroyed
    if (this.textRefreshInterval) {
      clearInterval(this.textRefreshInterval);
    }
    if (this.imageRefreshInterval) {
      clearInterval(this.imageRefreshInterval);
    }
    
    // Remove event listener
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}

// Create a singleton instance
export const refreshService = new RefreshService();