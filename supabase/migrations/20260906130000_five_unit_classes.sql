-- Five classes with five progression tiers. Edge resets old roster ownership
-- to class starters on first read, retaining learning/construction and frozen battles.
CREATE OR REPLACE FUNCTION public.roster_unit_id(p_id text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT COALESCE(p_id IN ('militia','spearman','swordsman','royal-guard','champion','slinger','archer','crossbowman','ranger','marksman','scout-rider','horseman','lancer','knight','royal-knight','medic','herbalist','acolyte','priest','high-priest','ballista','catapult','trebuchet','bombard','great-bombard'),false); $$;
REVOKE ALL ON FUNCTION public.roster_unit_id(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.roster_unit_id(text) TO service_role;

ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT '{"version":6,"units":{},"towers":{"rule":"earned-proficiency-v1","points":{"force":0,"runes":0,"reagents":0,"essence":0,"cores":0,"astral":0,"insight":0,"influence":0}},"libraryConcepts":0,"armySlots":[null,null,null,null],"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0,"treasury":0,"library":0,"forge":0},"rewarded":[],"cleared":0,"battle":null}'::jsonb;
