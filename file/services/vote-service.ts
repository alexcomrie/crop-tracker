// API endpoint for votes
const VOTE_API_URL = 'https://script.google.com/macros/s/AKfycbwZwJ4RTAjSZjL1ScKpiwTFWjZRL9myWYisf-eck0rTgUziMluQ2WjmxL8uWkj9GgmC/exec';

// Web app URL for CORS
export const WEB_APP_URL = 'https://the-hubja.netlify.app';

// Response interface for vote API
export interface VoteResponse {
  success: boolean;
  message?: string;
  votes?: {
    businessId: string;
    likes: number;
    dislikes: number;
    userVote: 'like' | 'dislike' | null;
  };
}

/**
 * Fetches vote data for a specific business
 */
export async function getVotes(businessId: string): Promise<VoteResponse> {
  try {
    // Get username from localStorage or use empty string
    const username = localStorage.getItem('username') || '';
    
    const params = new URLSearchParams({
      action: 'getVotes',
      businessId,
      username
    });

    const response = await fetch(`${VOTE_API_URL}?${params}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch votes: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch votes');
    }
    return data;
  } catch (error) {
    console.error('Error fetching votes:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Submits a vote for a business
 */
export async function vote(
  businessId: string,
  voteType: 'like' | 'dislike'
): Promise<VoteResponse> {
  try {
    const username = localStorage.getItem('username') || '';
    const userId = localStorage.getItem('userId') || '';
    
    const formData = new URLSearchParams();
    formData.append('action', 'vote');
    formData.append('businessId', businessId);
    formData.append('username', username);
    formData.append('userId', userId);
    formData.append('voteType', voteType);
    
    const response = await fetch(VOTE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });
    
    if (!response.ok) {
      throw new Error(`Failed to submit vote: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to submit vote');
    }
    return data;
  } catch (error) {
    console.error('Error submitting vote:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}