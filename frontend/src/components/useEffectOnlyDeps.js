import { useEffect, useRef } from 'react';

/**
 * - useEffect that will not trigger on initial render
 * - Only triggers when the dependencies change
*/
export default function useEffectOnlyDeps(func, deps){
    const didMount = useRef(false);

    useEffect(() => {
        if (didMount.current) func();
        else didMount.current = true;
    }, deps);
}
