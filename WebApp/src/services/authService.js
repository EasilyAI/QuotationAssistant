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
        
        // Return special response so Login component can show password change form
        resolve({
          code: 'NEW_PASSWORD_REQUIRED',
          cognitoUser: cognitoUser,
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
export const completeNewPasswordChallenge = async (cognitoUser, newPassword, userAttributes = {}, requiredAttributes = []) => {
  return new Promise((resolve, reject) => {
    // Build attributes map to avoid duplicates - use Map with attribute name as key
    const attributesMap = new Map();
    
    // List of read-only attributes we should never try to set
    const readOnlyAttributes = ['sub', 'email_verified', 'phone_number_verified', 'cognito:user_status'];
    
    // Process required attributes
    if (requiredAttributes && Array.isArray(requiredAttributes) && requiredAttributes.length > 0) {
      requiredAttributes.forEach(attrName => {
        // Skip read-only attributes
        if (readOnlyAttributes.includes(attrName)) {
          return;
        }
        
        // Skip if we already have this attribute
        if (attributesMap.has(attrName)) {
          return;
        }
        
        // Check if attribute exists in userAttributes with a valid value
        if (userAttributes[attrName] && String(userAttributes[attrName]).trim() !== '') {
          const attrValue = String(userAttributes[attrName]).trim();
          attributesMap.set(attrName, attrValue);
        } else if (attrName === 'name') {
          // Generate name from email if name is required but not provided
          const email = userAttributes.email || '';
          if (email) {
            const nameFromEmail = email.split('@')[0].trim() || 'User';
            attributesMap.set('name', nameFromEmail);
          } else {
            // Fallback if no email
            attributesMap.set('name', 'User');
          }
        }
      });
    }
    
    // Convert map to array of CognitoUserAttribute objects
    // Create a fresh array to avoid any serialization issues
    const attributes = [];
    attributesMap.forEach((value, name) => {
      // Only add if value is not empty
      if (value && String(value).trim() !== '') {
        try {
          const attr = new CognitoUserAttribute({
            Name: String(name),
            Value: String(value).trim(),
          });
          // Verify it's a valid CognitoUserAttribute
          if (attr && attr.Name && attr.Value) {
            attributes.push(attr);
          }
        } catch (e) {
          console.error(`Error creating attribute ${name}:`, e);
        }
      }
    });
    
    // Debug logging
    console.log('Password change - Required attributes:', requiredAttributes);
    console.log('Password change - User attributes:', userAttributes);
    console.log('Password change - Attributes array length:', attributes.length);
    console.log('Password change - Attributes to send:', attributes.map(a => ({ Name: a.Name, Value: a.Value })));
    console.log('Password change - Is array?', Array.isArray(attributes));

    // Workaround for SDK serialization bug:
    // If we have attributes, ensure they're in a clean array format
    // The SDK sometimes has issues serializing CognitoUserAttribute arrays
    let attributesToPass;
    if (attributes.length === 0) {
      attributesToPass = undefined;
    } else {
      // Recreate attributes as fresh objects to avoid any serialization issues
      attributesToPass = attributes.map(attr => {
        return new CognitoUserAttribute({
          Name: String(attr.Name),
          Value: String(attr.Value),
        });
      });
    }
    
    console.log('Password change - Final attributes to pass:', attributesToPass ? attributesToPass.length : 'undefined');
    
    cognitoUser.completeNewPasswordChallenge(
      newPassword,
      attributesToPass,
      {
        onSuccess: (result) => {
          const token = result.getIdToken().getJwtToken();
          const user = {
            username: result.getIdToken().payload['cognito:username'] || '',
            email: result.getIdToken().payload.email || '',
            sub: result.getIdToken().payload.sub,
          };
          resolve({ token, user });
        },
        onFailure: (err) => {
          console.error('Password change error:', err);
          console.error('Password change error details:', JSON.stringify(err, null, 2));
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
