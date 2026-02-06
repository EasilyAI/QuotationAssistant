/**
 * AWS Cognito Authentication Service
 * 
 * Handles user authentication using AWS Cognito User Pool.
 */

import { 
  CognitoUserPool, 
  CognitoUser, 
  AuthenticationDetails,
  CognitoUserAttribute
} from 'amazon-cognito-identity-js';

// Cognito configuration from environment variables
const COGNITO_USER_POOL_ID = process.env.REACT_APP_COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.REACT_APP_COGNITO_CLIENT_ID || '';
const COGNITO_REGION = process.env.REACT_APP_COGNITO_REGION || 'us-east-1';

// Initialize Cognito User Pool
const poolData = {
  UserPoolId: COGNITO_USER_POOL_ID,
  ClientId: COGNITO_CLIENT_ID,
};

const userPool = COGNITO_USER_POOL_ID ? new CognitoUserPool(poolData) : null;

// Store CognitoUser outside React lifecycle to preserve internal authentication state
// This is necessary because CognitoUser objects contain non-serializable internal state
let pendingPasswordChangeUser = null;
let pendingPasswordChangeAttributes = null;
let pendingPasswordChangeRequiredAttributes = null;

/**
 * Get current authenticated user
 * @returns {CognitoUser|null} Current user or null if not authenticated
 */
export const getCurrentUser = () => {
  if (!userPool) {
    return null;
  }
  return userPool.getCurrentUser();
};

/**
 * Get current user's session token
 * @returns {Promise<string|null>} ID token or null if not authenticated
 */
export const getCurrentSession = async () => {
  return new Promise((resolve, reject) => {
    const cognitoUser = getCurrentUser();
    
    if (!cognitoUser) {
      resolve(null);
      return;
    }
    
    cognitoUser.getSession((err, session) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      
      resolve(session.getIdToken().getJwtToken());
    });
  });
};

/**
 * Sign in user
 * @param {string} username - Username or email
 * @param {string} password - Password
 * @returns {Promise<{token: string, user: object}|{code: 'NEW_PASSWORD_REQUIRED', cognitoUser, userAttributes, requiredAttributes}>} Authentication result
 */
export const signIn = async (username, password) => {
  if (!userPool) {
    throw new Error('Cognito is not configured. Please set REACT_APP_COGNITO_USER_POOL_ID and REACT_APP_COGNITO_CLIENT_ID');
  }
  
  return new Promise((resolve, reject) => {
    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });
    
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool,
    });
    
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (result) => {
        const token = result.getIdToken().getJwtToken();
        const user = {
          username: result.getIdToken().payload['cognito:username'] || username,
          email: result.getIdToken().payload.email || '',
          sub: result.getIdToken().payload.sub,
        };
        resolve({ token, user });
      },
      onFailure: (err) => {
        reject(new Error(err.message || 'Authentication failed'));
      },
      newPasswordRequired: (userAttributes, requiredAttributes) => {
        // Handle new password required (first time login)
        // Convert userAttributes from Cognito format to plain object
        const attributesObj = {};
        if (userAttributes) {
          // Check if it's an array (Cognito format) or already an object
          if (Array.isArray(userAttributes)) {
            userAttributes.forEach(attr => {
              if (attr && attr.Name && attr.Value !== undefined) {
                attributesObj[attr.Name] = attr.Value;
              }
            });
          } else if (typeof userAttributes === 'object') {
            // Already an object, use it directly
            Object.assign(attributesObj, userAttributes);
          }
        }
        
        // Ensure we have email from the username if not in attributes
        // username is in the outer scope from signIn function
        if (!attributesObj.email && username && username.includes('@')) {
          attributesObj.email = username;
        }
        
        // Store CognitoUser outside React lifecycle to preserve internal state
        pendingPasswordChangeUser = cognitoUser;
        pendingPasswordChangeAttributes = attributesObj;
        pendingPasswordChangeRequiredAttributes = requiredAttributes || [];
        
        // Return special response so Login component can show password change form
        resolve({
          code: 'NEW_PASSWORD_REQUIRED',
          userAttributes: attributesObj,
          requiredAttributes: requiredAttributes || [],
        });
      },
    });
  });
};

/**
 * Complete new password challenge
 * @param {CognitoUser} cognitoUser - Cognito user object
 * @param {string} newPassword - New password
 * @param {object} userAttributes - User attributes from newPasswordRequired callback
 * @param {array} requiredAttributes - Required attributes from newPasswordRequired callback
 * @returns {Promise<{token: string, user: object}>} Authentication result
 */
export const completeNewPasswordChallenge = async (newPassword, userAttributes = {}, requiredAttributes = []) => {
  return new Promise((resolve, reject) => {
    // Use the stored CognitoUser from module scope to preserve internal state
    const cognitoUser = pendingPasswordChangeUser;
    
    // Validate cognitoUser
    if (!cognitoUser) {
      reject(new Error('CognitoUser object is required. Please sign in again.'));
      return;
    }

    // Validate that cognitoUser has the required method
    if (typeof cognitoUser.completeNewPasswordChallenge !== 'function') {
      reject(new Error('CognitoUser object is invalid or has lost its internal state'));
      return;
    }
    
    // Use stored attributes if not provided (for backward compatibility)
    const safeUserAttributes = userAttributes && Object.keys(userAttributes).length > 0 
      ? userAttributes 
      : (pendingPasswordChangeAttributes || {});
    const safeRequiredAttributes = requiredAttributes && requiredAttributes.length > 0
      ? requiredAttributes
      : (pendingPasswordChangeRequiredAttributes || []);

    // Ensure userAttributes is always an object
    const finalUserAttributes = safeUserAttributes && typeof safeUserAttributes === 'object' ? safeUserAttributes : {};
    
    // Ensure requiredAttributes is always an array
    const finalRequiredAttributes = Array.isArray(safeRequiredAttributes) ? safeRequiredAttributes : [];

    // List of read-only attributes we should never try to set
    const readOnlyAttributes = ['sub', 'email_verified', 'phone_number_verified', 'cognito:user_status'];
    
    // Build attributes as a PLAIN OBJECT (not array of CognitoUserAttribute)
    // The SDK's completeNewPasswordChallenge expects { attributeName: value } format
    const attributesObject = {};
    
    // Only process attributes if requiredAttributes is provided and has items
    if (finalRequiredAttributes && finalRequiredAttributes.length > 0) {
      finalRequiredAttributes.forEach(attrName => {
        // Skip read-only attributes
        if (readOnlyAttributes.includes(attrName)) {
          return;
        }
        
        // Get attribute value from userAttributes
        let attrValue = null;
        
        if (finalUserAttributes[attrName] && String(finalUserAttributes[attrName]).trim() !== '') {
          // Use the value from userAttributes if it exists and is not empty
          attrValue = String(finalUserAttributes[attrName]).trim();
        } else if (attrName === 'name') {
          // Generate name from email if name is required but not provided
          // This is necessary because Cognito requires the name attribute
          const email = finalUserAttributes.email || '';
          if (email) {
            // Extract name from email (part before @)
            const nameFromEmail = email.split('@')[0].trim();
            // Capitalize first letter
            attrValue = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1).toLowerCase();
          } else {
            // Fallback if no email
            attrValue = 'User';
          }
        }
        
        // Only add attribute if we have a valid value
        if (attrValue && attrValue.trim() !== '') {
          attributesObject[attrName] = attrValue.trim();
        }
      });
    }
    
    // Debug logging
    console.log('completeNewPasswordChallenge - Required attributes:', finalRequiredAttributes);
    console.log('completeNewPasswordChallenge - User attributes:', finalUserAttributes);
    console.log('completeNewPasswordChallenge - Attributes object:', attributesObject);
    
    // Only pass attributes object if it has values, otherwise pass undefined
    const finalAttributes = Object.keys(attributesObject).length > 0 ? attributesObject : undefined;
    
    console.log('completeNewPasswordChallenge - Final attributes:', finalAttributes);
    
    // Ensure cognitoUser is still valid before calling
    if (!cognitoUser || typeof cognitoUser.completeNewPasswordChallenge !== 'function') {
      reject(new Error('CognitoUser object is invalid. Please sign in again.'));
      return;
    }
    
    cognitoUser.completeNewPasswordChallenge(
      newPassword,
      finalAttributes,
      {
        onSuccess: (result) => {
          const token = result.getIdToken().getJwtToken();
          const user = {
            username: result.getIdToken().payload['cognito:username'] || '',
            email: result.getIdToken().payload.email || '',
            sub: result.getIdToken().payload.sub,
          };
          // Clear stored values after successful password change
          pendingPasswordChangeUser = null;
          pendingPasswordChangeAttributes = null;
          pendingPasswordChangeRequiredAttributes = null;
          
          resolve({ token, user });
        },
        onFailure: (err) => {
          console.error('Password change error:', err);
          console.error('Password change error details:', JSON.stringify(err, null, 2));
          
          // DON'T clear stored values on password policy errors
          // Only clear on authentication/session errors
          // This allows the user to retry with a valid password
          const isSessionError = err.code === 'NotAuthorizedException' || 
                                  err.code === 'ExpiredCodeException' ||
                                  err.message?.includes('session');
          
          if (isSessionError) {
            // Clear stored values only for session errors
            pendingPasswordChangeUser = null;
            pendingPasswordChangeAttributes = null;
            pendingPasswordChangeRequiredAttributes = null;
          }
          // For password policy errors, keep the CognitoUser so user can retry
          
          reject(new Error(err.message || err.code || 'Failed to set new password'));
        },
      }
    );
  });
};

/**
 * Sign out current user
 */
export const signOut = () => {
  const cognitoUser = getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
};

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} True if authenticated
 */
export const isAuthenticated = async () => {
  const token = await getCurrentSession();
  return token !== null;
};

/**
 * Get authentication token for API requests
 * @returns {Promise<string|null>} Bearer token or null
 */
export const getAuthToken = async () => {
  const token = await getCurrentSession();
  return token ? `Bearer ${token}` : null;
};

/**
 * Get current user information from ID token
 * @returns {Promise<{name: string, email: string, username: string}|null>} User info or null if not authenticated
 */
export const getCurrentUserInfo = async () => {
  return new Promise((resolve, reject) => {
    const cognitoUser = getCurrentUser();
    
    if (!cognitoUser) {
      resolve(null);
      return;
    }
    
    cognitoUser.getSession((err, session) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      
      try {
        const idToken = session.getIdToken();
        const payload = idToken.payload;
        
        // Extract user information from token payload
        // Priority: name > given_name > email (first part) > username
        let displayName = payload.name || 
                         payload.given_name || 
                         (payload.email ? payload.email.split('@')[0] : null) ||
                         payload['cognito:username'] ||
                         'User';
        
        // Convert to title case (first letter of each word capitalized)
        const toTitleCase = (str) => {
          if (!str) return str;
          return str.toLowerCase().split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
        };
        
        displayName = toTitleCase(displayName);
        
        const userInfo = {
          name: displayName,
          email: payload.email || '',
          username: payload['cognito:username'] || '',
          givenName: payload.given_name || '',
          familyName: payload.family_name || '',
        };
        
        resolve(userInfo);
      } catch (error) {
        console.error('Error extracting user info:', error);
        resolve(null);
      }
    });
  });
};
