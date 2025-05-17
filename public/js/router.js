/**
 * Router module for SPA navigation
 */
import { Router, transitions, renderer, componentLoader } from './deps.js';
import { localizer } from './i18n-setup.js';
import {
  initLoginPage, 
  initRegisterPage, 
  initApiKeysPage, 
  initSettingsPage, 
  initSubscriptionPage, 
  initResetPasswordPage,
  initManageSubscriptionPage
} from './page-initializers.js';

// Create a DOM fragment with the default layout
function createLayoutFragment(content) {
  // Create a document fragment
  const fragment = document.createDocumentFragment();
  
  // Create header
  const header = document.createElement('pf-header');
  fragment.appendChild(header);
  
  // Create content container
  const contentDiv = document.createElement('div');
  contentDiv.className = 'content';
  
  // If content is a string, use createContextualFragment to parse it
  if (typeof content === 'string') {
    const range = document.createRange();
    const parsedContent = range.createContextualFragment(content);
    contentDiv.appendChild(parsedContent);
  } else if (content instanceof DocumentFragment) {
    // If it's already a fragment, append it directly
    contentDiv.appendChild(content);
  } else if (content instanceof Node) {
    // If it's a DOM node, append it directly
    contentDiv.appendChild(content);
  }
  
  fragment.appendChild(contentDiv);
  
  // Create footer
  const footer = document.createElement('pf-footer');
  fragment.appendChild(footer);
  
  return fragment;
}

/**
 * Load a page from the server
 * @param {string} url - Page URL
 * @returns {Promise<string>} - Page HTML
 */
async function loadPage(url) {
  try {
    // Add cache-busting parameter
    const fullUrl = `${url}?_=${Date.now()}`;
    
    const response = await fetch(fullUrl);
    if (!response.ok) {
      throw new Error(`Failed to load page: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract module script sources
    const moduleScripts = componentLoader.extractModuleScriptSources(doc);
    console.log('Extracted module scripts in router.js:', moduleScripts);
    
    // Execute any inline scripts
    await componentLoader.executeInlineScripts(doc);
    
    // Use the component loader to create a fragment with properly handled scripts
    const contentFragment = componentLoader.createFragmentWithScripts(doc);
    
    // Create a wrapper for translation
    const wrapper = document.createElement('div');
    wrapper.appendChild(contentFragment.cloneNode(true));
    
    // Pre-translate the content
    localizer.translateContainer(wrapper);
    
    // Create a new fragment with the translated content
    const translatedFragment = document.createDocumentFragment();
    while (wrapper.firstChild) {
      translatedFragment.appendChild(wrapper.firstChild);
    }
    
    // Extract and clone script tags again to ensure they're executed
    const scriptElements = componentLoader.extractAndCloneScripts(doc);
    
    // Add the script elements to the fragment
    scriptElements.forEach(script => {
      translatedFragment.appendChild(script);
    });
    
    // Create and add module scripts to the fragment
    if (moduleScripts && moduleScripts.length > 0) {
      console.log(`Adding ${moduleScripts.length} module scripts to the fragment`);
      
      moduleScripts.forEach(src => {
        // Create a new script element
        const script = document.createElement('script');
        script.type = 'module';
        
        // Convert to absolute URL if needed
        if (src.startsWith('http://') || src.startsWith('https://')) {
          script.src = src;
        } else {
          // For local scripts, create absolute URL based on current origin
          const baseUrl = window.location.origin;
          const absoluteSrc = src.startsWith('/')
            ? `${baseUrl}${src}`
            : `${baseUrl}/${src}`;
          script.src = absoluteSrc;
        }
        
        console.log(`Adding module script: ${script.src}`);
        translatedFragment.appendChild(script);
      });
    }
    
    // Return the content wrapped in the default layout as a DOM fragment
    return createLayoutFragment(translatedFragment);
  } catch (error) {
    console.error('Error loading page:', error);
    
    // Create an error fragment
    const errorFragment = document.createDocumentFragment();
    
    // Create error container
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    
    // Create error heading
    const heading = document.createElement('h1');
    heading.setAttribute('data-i18n', 'errors.error_loading_page');
    heading.textContent = 'Error Loading Page';
    errorDiv.appendChild(heading);
    
    // Create error message
    const message = document.createElement('p');
    message.textContent = error.message;
    errorDiv.appendChild(message);
    
    // Add to fragment
    errorFragment.appendChild(errorDiv);
    
    // Return the error wrapped in the default layout
    return createLayoutFragment(errorFragment);
  }
}

/**
 * Clean up any transition overlays
 */
function cleanupOverlays() {
  // Remove any transition overlays
  const overlays = document.querySelectorAll('.transition-overlay');
  console.log('Found transition overlays:', overlays.length);
  
  overlays.forEach(overlay => {
    if (document.body.contains(overlay)) {
      console.log('Removing transition overlay');
      document.body.removeChild(overlay);
    }
  });
  
  // Also check for any elements with opacity or visibility styles that might be leftover
  document.querySelectorAll('[style*="opacity: 0"]').forEach(el => {
    if (el.classList.contains('transition-overlay') || el.style.position === 'absolute') {
      console.log('Removing hidden element with opacity 0');
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
  });
  
  // Remove the initial loading overlay if it exists
  const initialOverlay = document.getElementById('initial-loading-overlay');
  if (initialOverlay && initialOverlay.parentNode) {
    console.log('Removing initial loading overlay');
    initialOverlay.style.opacity = '0';
    setTimeout(() => {
      if (initialOverlay.parentNode) {
        initialOverlay.parentNode.removeChild(initialOverlay);
      }
    }, 150);
  }
}

/**
 * Create and initialize the router
 * @param {Object} options - Router options
 * @returns {Router} Router instance
 */
export function createRouter(options = {}) {
  console.log('Creating router with options:', options);
  
  // Create a custom fade transition that ensures overlays are cleaned up
  const customFade = transitions.fade({
    duration: options.transitionDuration || 300,
    onComplete: () => {
      // Clean up any overlays
      cleanupOverlays();
      
      // Dispatch a custom event when the transition is complete
      document.dispatchEvent(new CustomEvent('spa-transition-end'));
    }
  });
  
  // Create the router
  const router = new Router({
    rootElement: options.rootElement || '#app',
    transition: customFade,
    renderer: renderer.createRenderer({
      translateContainer: localizer.translateContainer.bind(localizer),
      applyRTLToDocument: localizer.applyRTLToDocument.bind(localizer),
      keepScripts: true // Keep script tags in views
    }),
    errorHandler: (path) => {
      console.log('Custom error handler called for path:', path);
      
      // Clean up any overlays immediately
      cleanupOverlays();
      
      // Set up a safety interval to periodically check for and remove any overlays
      const safetyInterval = setInterval(cleanupOverlays, 500);
      
      // Clear the safety interval after 3 seconds
      setTimeout(() => {
        clearInterval(safetyInterval);
        console.log('Safety interval cleared');
      }, 3000);
      
      // Create error content fragment
      const contentFragment = document.createDocumentFragment();
      
      // Create content container
      const contentContainer = document.createElement('div');
      contentContainer.className = 'content-container';
      contentContainer.style.display = 'flex';
      contentContainer.style.justifyContent = 'center';
      contentContainer.style.alignItems = 'center';
      contentContainer.style.minHeight = '60vh';
      
      // Create error page div
      const errorPage = document.createElement('div');
      errorPage.className = 'error-page';
      
      // Create heading
      const heading = document.createElement('h1');
      heading.textContent = '404 - Page Not Found';
      errorPage.appendChild(heading);
      
      // Create message
      const message = document.createElement('p');
      message.textContent = `The page "${path}" could not be found.`;
      errorPage.appendChild(message);
      
      // Create back link
      const backLink = document.createElement('a');
      backLink.href = '/';
      backLink.className = 'back-link';
      backLink.textContent = 'Go back to home';
      errorPage.appendChild(backLink);
      
      // Assemble the fragment
      contentContainer.appendChild(errorPage);
      contentFragment.appendChild(contentContainer);
      
      // Return the error wrapped in the default layout
      return createLayoutFragment(contentFragment);
    }
  });
  
  // Store the original init method
  const originalInit = router.init;
  
  // Override the init method to do nothing if disableAutoInit is true
  if (options.disableAutoInit) {
    console.log('Auto-initialization disabled');
    router.init = function() {
      console.log('Manual initialization called');
      
      // Add event listeners for popstate and clicks
      window.addEventListener('popstate', (e) => {
        console.log('Popstate event, navigating to:', window.location.pathname);
        this.navigate(window.location.pathname, false);
      });
      
      // Intercept all clicks at the document level
      document.addEventListener('click', (e) => {
        // Skip if modifier keys are pressed
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        
        // Find anchor element in the event path
        const path = e.composedPath();
        let anchor = null;
        
        for (let i = 0; i < path.length; i++) {
          if (path[i].tagName === 'A') {
            anchor = path[i];
            break;
          }
        }
        
        // Skip if no anchor found
        if (!anchor) return;
        
        // Get the href attribute
        const href = anchor.getAttribute('href');
        
        // Skip if no href
        if (!href) return;
        
        // Skip if it's an external link
        if (href.startsWith('http') || href.startsWith('//')) return;
        
        // Skip if it has a target
        if (anchor.hasAttribute('target')) return;
        
        // Skip if it's a download link
        if (anchor.hasAttribute('download')) return;
        
        // Skip if it's an anchor link
        if (href.startsWith('#')) return;
        
        // Prevent default behavior
        e.preventDefault();
        
        // Navigate to the link
        this.navigate(href);
        
        console.log('Intercepted click on link:', href);
      }, { capture: true });
    };
  }
  
  // Add middleware for translations
  router.use(async (to, from, next) => {
    console.log(`Router middleware: from ${from || 'initial'} to ${to.path}`);
    
    // Dispatch pre-navigation event
    document.dispatchEvent(new CustomEvent('pre-navigation', {
      detail: { fromPath: from || '', toPath: to.path }
    }));
    
    // Continue with navigation
    next();
    
    // Apply translations after transition
    document.addEventListener('spa-transition-end', () => {
      localizer.translateDOM();
      localizer.applyRTLToDocument();
    }, { once: true });
  });
  
  // Override navigate method to dispatch events and handle loading state
  const originalNavigate = router.navigate.bind(router);
  router.navigate = async function(path, params = {}) {
    console.log(`Custom navigate method called for path: ${path}`);
    
    // Reset loading state if needed
    if (this.loading) {
      console.log('Resetting loading state before navigation');
      this.loading = false;
    }
    
    document.dispatchEvent(new CustomEvent('pre-navigation', {
      detail: { fromPath: window.location.pathname, toPath: path }
    }));
    
    return originalNavigate(path, params);
  };
  
  return router;
}

/**
 * Define routes for the application
 * @param {Router} router - Router instance
 */
export function defineRoutes(router) {
  console.log('Defining routes...');
  
  // Define routes
  const routes = {
    '/': {
      view: () => loadPage('/views/home.html')
    },
    '/chat': {
      view: () => loadPage('/views/chat.html')
    },
    '/login': {
      view: () => loadPage('/views/login.html'),
      afterRender: () => initLoginPage()
    },
    '/register': {
      view: () => loadPage('/views/register.html'),
      afterRender: () => initRegisterPage()
    },
    '/reset-password': {
      view: () => loadPage('/views/reset-password.html'),
      afterRender: () => initResetPasswordPage()
    },
    '/reset-password-confirm': {
      view: () => loadPage('/views/reset-password-confirm.html')
    },
    '/state-demo': {
      view: () => loadPage('/views/state-demo.html')
    },
    '/simple-state-demo': {
      view: () => loadPage('/views/simple-state-demo.html'),
      afterRender: () => {
        import('./components/simple-counter.js').catch(error => {
          console.error('Error loading simple-counter component:', error);
        });
      }
    },
    '/dashboard': {
      view: () => loadPage('/views/dashboard.html'),
      beforeEnter: async (to, from, next) => {
        try {
          const { checkAuthStatus } = await import('./utils/auth-status.js');
          const status = await checkAuthStatus();
          
          if (!status.authenticated) {
            return next('/login');
          }
          
          // Check subscription status
          const userJson = localStorage.getItem('user');
          if (userJson) {
            const user = JSON.parse(userJson);
            const hasActiveSubscription = user?.subscription?.status === 'active';
            
            if (!hasActiveSubscription) {
              alert('You need an active subscription to access the dashboard.');
              return next('/subscription');
            }
          }
          
          next();
        } catch (error) {
          console.error('Error checking authentication status:', error);
          return next('/login');
        }
      }
    },
    '/api-docs': {
      view: () => loadPage('/views/api-docs.html')
    },
    '/api-keys': {
      view: () => loadPage('/views/api-keys.html'),
      afterRender: () => initApiKeysPage()
    },
    '/settings': {
      view: () => loadPage('/views/settings.html'),
      afterRender: () => initSettingsPage()
    },
    '/subscription': {
      view: () => loadPage('/views/subscription.html'),
      afterRender: () => initSubscriptionPage()
    },
    '/stripe-payment': {
      view: () => loadPage('/views/stripe-payment-new.html')
    },
    '/terms': {
      view: () => loadPage('/views/terms.html')
    },
    '/privacy': {
      view: () => loadPage('/views/privacy.html')
    },
    '/refund': {
      view: () => loadPage('/views/refund.html')
    },
    '/i18n-demo': {
      view: () => loadPage('/views/i18n-demo.html')
    },
    '/manage-subscription': {
      view: () => loadPage('/views/manage-subscription.html'),
      afterRender: () => initManageSubscriptionPage(),
      beforeEnter: async (to, from, next) => {
        try {
          const { checkAuthStatus } = await import('./utils/auth-status.js');
          const status = await checkAuthStatus();
          
          if (!status.authenticated) {
            return next('/login');
          }
          next();
        } catch (error) {
          console.error('Error checking authentication status:', error);
          return next('/login');
        }
      }
    }
  };
  
  // Add aliases for routes with .html extension
  Object.keys(routes).forEach(path => {
    if (path !== '/') {
      routes[`${path}.html`] = routes[path];
    }
  });
  
  console.log('Routes defined:', Object.keys(routes));
  
  // Register routes
  router.registerRoutes(routes);
  
  // Debug: Log registered routes
  console.log('Routes registered:', Object.keys(router.routes));
  
  // Initialize the router
  console.log('Router initializing...');
  router.init();
  
  return router;
}