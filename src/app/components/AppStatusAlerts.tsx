interface AppStatusAlertsProps {
    kingdomError: string | null;
    kingdomUnavailable: boolean;
    resetError: string | null;
    settingsError: string | null;
    isDemoUser: boolean;
    onRetryKingdom: () => void;
    onReloadKingdom: () => void;
}

export function AppStatusAlerts({
    kingdomError,
    kingdomUnavailable,
    resetError,
    settingsError,
    isDemoUser,
    onRetryKingdom,
    onReloadKingdom,
}: AppStatusAlertsProps) {
    return (
        <>
            {kingdomError && (
                <div role="alert" className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-sm text-rose-800">
                    {kingdomError}
                    <button type="button" className="ml-3 underline font-bold" onClick={onRetryKingdom}>
                        Retry Castle action
                    </button>
                    {kingdomUnavailable && (
                        <button type="button" className="ml-3 underline font-bold" onClick={onReloadKingdom}>
                            Reload Castle
                        </button>
                    )}
                </div>
            )}
            {resetError && (
                <div role="alert" className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-sm text-rose-800">
                    {resetError}
                </div>
            )}
            {!isDemoUser && settingsError && (
                <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
                    {settingsError}
                </div>
            )}
        </>
    );
}
