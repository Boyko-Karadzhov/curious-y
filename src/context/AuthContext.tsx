import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemoUser: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithDemo: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USER_ID = 'demo-user-curious-y';
const DEMO_USER_KEY = 'curious_y_demo_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const storedDemo = typeof window !== 'undefined' ? localStorage.getItem(DEMO_USER_KEY) : null;
      return storedDemo ? JSON.parse(storedDemo) : null;
    } catch {
      return null;
    }
  });

  const [session, setSession] = useState<Session | null>(null);

  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const hasStoredDemo = !!localStorage.getItem(DEMO_USER_KEY);
    return isSupabaseConfigured() && !hasStoredDemo;
  });

  const [isDemoUser, setIsDemoUser] = useState<boolean>(() => {
    return typeof window !== 'undefined' && !!localStorage.getItem(DEMO_USER_KEY);
  });

  useEffect(() => {
    let isMounted = true;

    // Check if demo user is stored locally
    const storedDemo = localStorage.getItem(DEMO_USER_KEY);
    if (storedDemo) {
      const parsedDemoUser = JSON.parse(storedDemo);
      if (isMounted) {
        setUser(parsedDemoUser);
        setIsDemoUser(true);
        setLoading(false);
      }
      return;
    }

    if (!isSupabaseConfigured()) {
      if (isMounted) setLoading(false);
      return;
    }

    // Check active Supabase session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (isMounted) {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (isMounted) {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setIsDemoUser(false);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured()) {
      signInWithDemo();
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error('Error signing in with Google:', error.message);
      throw error;
    }
  };

  const signInWithDemo = () => {
    const demoUser: User = {
      id: DEMO_USER_ID,
      app_metadata: {},
      user_metadata: {
        full_name: 'Explorer Learner',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        email: 'learner@curious-y.app',
      },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(demoUser));
    setUser(demoUser);
    setIsDemoUser(true);
    setLoading(false);
  };

  const signOut = async () => {
    localStorage.removeItem(DEMO_USER_KEY);
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setIsDemoUser(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDemoUser,
        signInWithGoogle,
        signInWithDemo,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
