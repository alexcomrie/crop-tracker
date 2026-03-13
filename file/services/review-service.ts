import { ProductReview, BusinessReview } from '../types/review';

// API endpoint for reviews
const REVIEW_API_URL = 'https://script.google.com/macros/s/AKfycbwZwJ4RTAjSZjL1ScKpiwTFWjZRL9myWYisf-eck0rTgUziMluQ2WjmxL8uWkj9GgmC/exec';

// Web app URL for CORS
export const WEB_APP_URL = 'https://the-hubja.netlify.app';

// Response interface for product review API
export interface ProductReviewResponse {
  success: boolean;
  message?: string;
  reviews?: ProductReview[];
  summary?: {
    productId: string;
    businessId: string;
    totalReviews: number;
    averageRating: number;
  };
}

// Response interface for business review API
export interface BusinessReviewResponse {
  success: boolean;
  message?: string;
  reviews?: BusinessReview[];
  summary?: {
    businessId: string;
    totalReviews: number;
    averageRating: number;
  };
}



/**
 * Fetches reviews for a specific business
 */
export async function getBusinessReviews(businessId: string): Promise<BusinessReviewResponse> {
  try {
    const params = new URLSearchParams({
      action: 'getBusinessReviews',
      businessId
    });

    const response = await fetch(`${REVIEW_API_URL}?${params}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch business reviews: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch business reviews');
    }
    return data;
  } catch (error) {
    console.error('Error fetching business reviews:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      reviews: []
    };
  }
}

/**
 * Fetches reviews for a specific product
 */
export async function getProductReviews(productId: string, businessId: string): Promise<ProductReviewResponse> {
  try {
    const params = new URLSearchParams({
      action: 'getProductReviews',
      productId,
      businessId
    });

    const response = await fetch(`${REVIEW_API_URL}?${params}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch product reviews: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch product reviews');
    }
    return data;
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      reviews: []
    };
  }
}

/**
 * Submits a review for a product
 */
export async function submitProductReview(
  productId: string,
  businessId: string,
  rating: number,
  comment: string
): Promise<ProductReviewResponse> {
  try {
    const username = localStorage.getItem('username') || '';
    const userId = localStorage.getItem('userId') || '';
    const timestamp = new Date().getTime();
    
    const formData = new URLSearchParams();
    formData.append('action', 'submitProductReview');
    formData.append('productId', productId);
    formData.append('businessId', businessId);
    formData.append('username', username);
    formData.append('userId', userId);
    formData.append('rating', rating.toString());
    formData.append('comment', comment);
    formData.append('timestamp', timestamp.toString());

    const response = await fetch(REVIEW_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`Failed to submit product review: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to submit product review');
    }
    return data;
  } catch (error) {
    console.error('Error submitting product review:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      reviews: []
    };
  }
}

/**
 * Submits a review for a business
 */


export async function submitBusinessReview(
  businessId: string,
  rating: number,
  comment: string
): Promise<BusinessReviewResponse> {
  try {
    const username = localStorage.getItem('username') || '';
    const userId = localStorage.getItem('userId') || '';
    const timestamp = new Date().getTime();
    
    const formData = new URLSearchParams();
    formData.append('action', 'submitBusinessReview');
    formData.append('businessId', businessId);
    formData.append('username', username);
    formData.append('userId', userId);
    formData.append('rating', rating.toString());
    formData.append('comment', comment);
    formData.append('timestamp', timestamp.toString());

    const response = await fetch(REVIEW_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`Failed to submit business review: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to submit business review');
    }
    return data;
  } catch (error) {
    console.error('Error submitting business review:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      reviews: []
    };
  }
}