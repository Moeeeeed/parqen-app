import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const TourContext = createContext(null);

export const DEFAULT_TOUR_STEPS = [
  {
    id: 'nav-login',
    selector: '#nav-login-btn',
    title: 'Log In',
    content: 'Firstly, click on the Log in button located in the top navigation bar.',
    placement: 'bottom',
  },
  {
    id: 'auth-create-account-btn',
    selector: '#btn-go-register',
    title: 'Create Account',
    content: "Following this, click the 'Create a Free Account' button to begin your registration.",
    placement: 'bottom',
  },
  {
    id: 'reg-email',
    selector: '#reg-email-input',
    title: 'Email Address',
    content: 'Afterwards, enter your email address in the Email field to proceed with account creation.',
    placement: 'left',
  },
  {
    id: 'reg-fullname',
    selector: '#reg-fullname-input',
    title: 'Full Name',
    content: 'Following this, enter your full name in the Full Name field to complete registration.',
    placement: 'left',
  },
  {
    id: 'reg-username',
    selector: '#reg-username-input',
    title: 'Username',
    content: 'Afterwards, enter your preferred username in the Username field to complete account setup.',
    placement: 'left',
  },
  {
    id: 'reg-password',
    selector: '#reg-password-input',
    title: 'Password',
    content: 'Following this, enter your secure password in the Password field to protect your account.',
    placement: 'left',
  },
  {
    id: 'reg-confirm-password',
    selector: '#reg-confirm-password-input',
    title: 'Confirm Password',
    content: 'Afterwards, enter your password again in the Confirm Password field to verify.',
    placement: 'left',
  },
  {
    id: 'reg-terms',
    selector: '#reg-terms-checkbox',
    title: 'Terms & Conditions',
    content: 'After that, click the checkbox to agree to the Terms of Service and Privacy Policy.',
    placement: 'top',
  },
  {
    id: 'reg-submit',
    selector: '#reg-submit-btn',
    title: 'Submit Registration',
    content: 'Following that, click the Create Account button to complete your registration.',
    placement: 'top',
  },
  {
    id: 'welcome-close',
    selector: '#welcome-modal-close',
    title: 'Welcome Gift',
    content: 'Afterwards, close the welcome gift popup by clicking the X button to continue.',
    placement: 'left',
  },
  {
    id: 'onboarding-next',
    selector: '#onboarding-next-btn',
    title: 'Onboarding Tutorial',
    content: 'From here, click the Next button to proceed to the next step of the tutorial.',
    placement: 'top',
  },
  {
    id: 'verify-code-0',
    selector: '#verify-code-0',
    title: 'Verification Code',
    content: 'To wrap things up, enter the first digit of your six-digit verification code.',
    placement: 'left',
  },
];

export function TourProvider({ children }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState(DEFAULT_TOUR_STEPS);

  const startTour = useCallback((customSteps = null, startIndex = 0) => {
    if (customSteps && customSteps.length > 0) {
      setSteps(customSteps);
    } else {
      setSteps(DEFAULT_TOUR_STEPS);
    }
    setCurrentStepIndex(startIndex);
    setIsActive(true);
  }, []);

  const stopTour = useCallback(() => {
    setIsActive(false);
    setCurrentStepIndex(0);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      if (prev + 1 < steps.length) {
        return prev + 1;
      }
      setIsActive(false);
      return 0;
    });
  }, [steps.length]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToStepById = useCallback((stepId) => {
    const idx = steps.findIndex((s) => s.id === stepId || s.selector === stepId);
    if (idx !== -1) {
      setCurrentStepIndex(idx);
      setIsActive(true);
    }
  }, [steps]);

  // Keyboard controls (Arrow Left/Right, Escape)
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') nextStep();
      else if (e.key === 'ArrowLeft') prevStep();
      else if (e.key === 'Escape') stopTour();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, nextStep, prevStep, stopTour]);

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStepIndex,
        currentStep: steps[currentStepIndex] || null,
        totalSteps: steps.length,
        steps,
        startTour,
        stopTour,
        nextStep,
        prevStep,
        goToStepById,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    return {
      isActive: false,
      currentStepIndex: 0,
      currentStep: null,
      totalSteps: 0,
      steps: [],
      startTour: () => {},
      stopTour: () => {},
      nextStep: () => {},
      prevStep: () => {},
      goToStepById: () => {},
    };
  }
  return ctx;
}
