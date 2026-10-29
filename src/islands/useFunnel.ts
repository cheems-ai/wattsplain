import { useEffect, useState } from 'preact/hooks';

import { track } from '../analytics/client';

/**
 * Calculator funnel events: "tool" on the visitor's first input, then "result" the first time a
 * valid result follows an input and "error" the first time a form error does. Defaults shown
 * before anyone touches the form are not counted. Returns `touch` for the form's onInput.
 */
export function useFunnel(ok: boolean, error: boolean): () => void {
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched && ok) track('result');
  }, [touched, ok]);
  useEffect(() => {
    if (touched && error) track('error');
  }, [touched, error]);
  return () => {
    if (!touched) setTouched(true);
    track('tool');
  };
}
