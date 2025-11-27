const API_URL = 'https://uzq2msccdm2sczqgr2kseiwuma0jdgav.lambda-url.us-west-2.on.aws/';

interface QueryApiRequest {
  query: string;
  // employee_id: string;
  session_id?: string; // Optional session ID for conversation tracking
}

interface QueryApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  agent_response?: string; // The response text to send back to the user
  message?: string;
}

/**
 * Formats agent response text by removing odd line breaks and adding meaningful ones
 * @param text - The text to format
 * @returns Formatted text with proper line breaks
 */
const formatAgentResponse = (text: string): string => {
  if (!text || !text.trim()) {
    return text;
  }

  // Step 1: Normalize whitespace - replace multiple spaces/tabs with single space
  let formatted = text.replace(/[ \t]+/g, ' ');

  // Step 2: Replace multiple consecutive line breaks (3+) with double line break (paragraph break)
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // Step 3: Remove line breaks that are in the middle of sentences
  // (line breaks not preceded by sentence-ending punctuation or paragraph breaks)
  formatted = formatted.replace(/([^.!?\n])\n([^ \n])/g, '$1 $2');

  // Step 4: Fix line breaks after sentence-ending punctuation that are followed by lowercase
  // (should be space instead of line break)
  formatted = formatted.replace(/([.!?])\n([a-z])/g, '$1 $2');

  // Step 5: Normalize double line breaks (ensure consistent paragraph breaks)
  formatted = formatted.replace(/\n\n+/g, '\n\n');

  // Step 6: Trim whitespace from each line
  formatted = formatted
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // Step 7: Add meaningful line breaks after sentences when followed by capital letters
  // (but preserve existing paragraph breaks)
  formatted = formatted.replace(/([.!?])\s+([A-Z][a-z])/g, (match, punctuation, nextWord, offset, str) => {
    // Check if there's already a paragraph break before this position
    const beforeText = str.substring(0, offset);
    const isAfterParagraph = beforeText.endsWith('\n\n');
    
    // If not after a paragraph break, add a single line break for readability
    if (!isAfterParagraph) {
      return `${punctuation}\n${nextWord}`;
    }
    return match;
  });

  // Step 8: Remove multiple spaces in the middle of sentences (between words)
  // Replace 2+ spaces with single space, but preserve line breaks
  formatted = formatted.replace(/[ ]{2,}/g, ' ');

  // Step 9: Final trim
  return formatted.trim();
};

/**
 * Makes a POST request to the query API with the provided query text and employee ID
 * @param query - The query text (email text, SMS text, or WhatsApp text)
 * @param employeeId - The employee ID (defaults to "1892" if not provided)
 * @param sessionId - Optional session ID for conversation tracking (SMS/WhatsApp/Email)
 * @returns Promise resolving to the API response data with agent_response field
 */
export const callQueryApi = async (
  query: string,
  // employeeId: string = '1892',
  sessionId?: string
): Promise<QueryApiResponse> => {
  try {
    if (!query || !query.trim()) {
      throw new Error('Query text is required');
    }

    // Prepare the request body for the external API
    const apiRequestBody: QueryApiRequest = {
      query: query.trim(),
      // employee_id: employeeId,
    };

    // Add sessionId if provided
    if (sessionId) {
      apiRequestBody.session_id = sessionId;
    }

    console.log('Calling Query API:', {
      url: API_URL,
      query: apiRequestBody.query.substring(0, 100) + (apiRequestBody.query.length > 100 ? '...' : ''),
      // employee_id: apiRequestBody.employee_id,
      session_id: apiRequestBody.session_id || 'not provided',
    });

    // Make POST request to the external API
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiRequestBody),
    });

    // Check if the response is ok
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Query API call failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    // Parse the response
    const responseData = await response.json() as QueryApiResponse;

    // Format agent_response if it exists
    if (responseData.agent_response) {
      responseData.agent_response = formatAgentResponse(responseData.agent_response);
    }

    console.log('Query API call successful:', {
      status: response.status,
      success: responseData.success,
      hasAgentResponse: !!responseData.agent_response,
      agentResponsePreview: responseData.agent_response 
        ? responseData.agent_response.substring(0, 100) + (responseData.agent_response.length > 100 ? '...' : '')
        : undefined,
    });
    
    return responseData;
  } catch (error) {
    console.error('Error calling Query API:', {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};

/**
 * Extracts the response text from the API response to send back to the user
 * @param apiResponse - The response from callQueryApi
 * @param fallbackMessage - Optional fallback message if no response is available
 * @returns The response text to send to the user
 */
export const getResponseText = (
  apiResponse: QueryApiResponse,
  fallbackMessage: string = 'Thank you for your message. We have received it and will get back to you soon.'
): string => {
  // Priority: agent_response > message > data > fallback
  if (apiResponse.agent_response && apiResponse.agent_response.trim()) {
    return apiResponse.agent_response.trim();
  }
  if (apiResponse.message && apiResponse.message.trim()) {
    return apiResponse.message.trim();
  }
  if (apiResponse.data && typeof apiResponse.data === 'string') {
    return apiResponse.data.trim();
  }
  if (apiResponse.data && typeof apiResponse.data === 'object' && apiResponse.data.response) {
    return String(apiResponse.data.response).trim();
  }
  return fallbackMessage;
};

