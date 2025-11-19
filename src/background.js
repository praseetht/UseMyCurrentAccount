let email = '';
let useCurrentAccount = true;

// Debug flag - set to false to disable logging in production
const DEBUG = true;

// Debug logging helper
function debugLog(message, ...args) {
    if (DEBUG) {
        console.log(`[UseMyCurrentAccount] ${message}`, ...args);
    }
}

function debugWarn(message, ...args) {
    if (DEBUG) {
        console.warn(`[UseMyCurrentAccount] ${message}`, ...args);
    }
}

function debugError(message, ...args) {
    // Always log errors, even in production
    console.error(`[UseMyCurrentAccount] ${message}`, ...args);
}

// Function to get email with promise support
async function getEmail() {
    if (email) {
        debugLog('Using cached email:', email);
        return email;
    }
    
    try {
        debugLog('Requesting profile user info from identity API...');
        const userInfo = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
        debugLog('Profile userInfo received:', JSON.stringify(userInfo, null, 2));
        
        if (userInfo && userInfo.email) {
            email = userInfo.email;
            debugLog('✓ Email loaded successfully:', email);
            return email;
        } else {
            debugWarn('No email found in userInfo. Make sure you are signed into Edge.');
            return '';
        }
    } catch (error) {
        debugError('Error getting profile:', error);
        return '';
    }
}

// Initialize on service worker startup
debugLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
debugLog('Service worker starting up...');
debugLog('Chrome Identity API available:', typeof chrome.identity);
debugLog('Methods:', Object.keys(chrome.identity || {}));
debugLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
getEmail().then((emailResult) => {
    debugLog('Initial email fetch completed:', emailResult);
    getState(function(state) {
        debugLog('Initial state loaded:', state);
        updateIcon(state);
    });
});

// Use declarativeNetRequest to redirect login URLs
async function updateRedirectRules() {
    debugLog('updateRedirectRules called, useCurrentAccount:', useCurrentAccount);
    const userEmail = await getEmail();
    
    if (!userEmail || !useCurrentAccount) {
        // Remove all rules when disabled or no email
        debugLog('Removing redirect rules. Email:', userEmail, 'Enabled:', useCurrentAccount);
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1, 2]
        });
        return;
    }

    const domain = userEmail.split('@').pop();
    debugLog('Setting up rules for email:', userEmail, 'domain:', domain);
    
    // Rule 1: Add login_hint parameter to /authorize URLs
    const rule1 = {
        id: 1,
        priority: 1,
        action: {
            type: 'redirect',
            redirect: {
                transform: {
                    queryTransform: {
                        addOrReplaceParams: [
                            { key: 'login_hint', value: userEmail }
                        ]
                    }
                }
            }
        },
        condition: {
            urlFilter: '||login.microsoftonline.com/*/authorize',
            resourceTypes: ['main_frame', 'sub_frame']
        }
    };

    // Rule 2: Add whr parameter to /saml2 and /wsfed URLs
    const rule2 = {
        id: 2,
        priority: 1,
        action: {
            type: 'redirect',
            redirect: {
                transform: {
                    queryTransform: {
                        addOrReplaceParams: [
                            { key: 'whr', value: domain }
                        ]
                    }
                }
            }
        },
        condition: {
            regexFilter: '^https://login\\.microsoftonline\\.com/.*/(?:saml2|wsfed)',
            resourceTypes: ['main_frame', 'sub_frame']
        }
    };

    try {
        debugLog('Adding rules:', JSON.stringify([rule1, rule2], null, 2));
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1, 2],
            addRules: [rule1, rule2]
        });
        debugLog('Redirect rules updated successfully for', userEmail);
        
        // Verify rules were added
        const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
        debugLog('Current dynamic rules:', JSON.stringify(dynamicRules, null, 2));
    } catch (error) {
        debugError('Error updating redirect rules:', error);
    }
}

function setState(state){
   useCurrentAccount = state;
   chrome.storage.local.set({
      state: state
  });
  // Update rules when state changes
  updateRedirectRules();
}

function getState(callback) {
   chrome.storage.local.get('state', function(data) {
      if(data.state === undefined) {
         useCurrentAccount = true;
      }
      else{
         useCurrentAccount = data.state;
      }

      callback(useCurrentAccount);
   });
}

// Update rules when extension loads
debugLog('Initializing redirect rules on startup...');
getEmail().then(() => {
    getState(function(state) {
        debugLog('Calling updateRedirectRules on startup with state:', state);
        updateRedirectRules();
    });
});

chrome.action.onClicked.addListener(function() {
   debugLog('Extension icon clicked');
   getState(function(state) {
       var newState = !state;
       debugLog('Toggling state from', state, 'to', newState);
       updateIcon(newState);
       setState(newState);
   });
});

function updateIcon(state) {
   var color = [255, 0, 0, 255];
   var text = state ? '' : 'Off';
   chrome.action.setBadgeBackgroundColor({
       color: color
   });

   chrome.action.setBadgeText({
       text: text
   });
}
