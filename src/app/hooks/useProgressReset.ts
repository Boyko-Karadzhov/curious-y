import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { resetUserProgress, shouldConfirmReset } from '../../services/database';

interface ProgressResetOptions {
    userId?: string;
    isCollecting: () => boolean;
    beginReset: () => void;
    waitForPendingAnswer: () => Promise<void>;
    clearSession: () => void;
}

export function useProgressReset({
    userId,
    isCollecting,
    beginReset,
    waitForPendingAnswer,
    clearSession,
}: ProgressResetOptions) {
    const resettingRef = useRef(false);
    const [resetError, setResetError] = useState<string | null>(null);

    const resetProgress = useCallback(async () => {
        if (!userId || isCollecting()) {
            return;
        }

        if (!shouldConfirmReset()) {
            return;
        }

        await runReset(userId, resettingRef, setResetError, beginReset, waitForPendingAnswer, clearSession);
    }, [userId, isCollecting, beginReset, waitForPendingAnswer, clearSession]);

    return { resettingRef, resetError, resetProgress };
}

async function runReset(userId: string, resettingRef: MutableRefObject<boolean>,
    setResetError: (message: string | null) => void, beginReset: () => void,
    waitForPendingAnswer: () => Promise<void>, clearSession: () => void): Promise<void> {
    resettingRef.current = true;
    beginReset();
    try {
        await waitForPendingAnswer();
        await resetUserProgress(userId);
        clearSession();
        setResetError(null);
    } catch (error) {
        console.error('Failed to reset progress in App:', error);
        setResetError('Progress could not be reset. Please retry.');
    } finally {
        resettingRef.current = false;
    }
}
