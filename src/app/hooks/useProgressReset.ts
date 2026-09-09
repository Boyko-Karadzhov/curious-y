import { useCallback, useRef, useState } from 'react';
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
    }, [userId, isCollecting, beginReset, waitForPendingAnswer, clearSession]);

    return { resettingRef, resetError, resetProgress };
}
