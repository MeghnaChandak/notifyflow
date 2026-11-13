import { useEffect, useRef } from "react";
import axios from "axios";
import useEffectOnlyDeps from "./useEffectOnlyDeps";

function useFunctionDebounce(func, delay, deps) {
    const callback = useRef(func);
    const cancelTokenSourceRef = useRef(null);

    useEffect(() => {
        callback.current = func;
    }, [func]);

    useEffect(() => {
        if (!deps || deps.length === 0) return;

        const handler = async () => {
            if (cancelTokenSourceRef.current) {
                cancelTokenSourceRef.current.cancel("Operation canceled due to new request.");
            }
            cancelTokenSourceRef.current = axios.CancelToken.source();

            try {
                await callback.current(cancelTokenSourceRef.current.token);
            } catch (error) {
                if (!axios.isCancel(error)) {
                    throw error;
                }
            }
        };
        const timer = setTimeout(handler, delay);

        return () => {
            clearTimeout(timer);
            if (cancelTokenSourceRef.current) {
                cancelTokenSourceRef.current.cancel("Request canceled due to component unmount.");
            }
        };
    }, [delay, ...deps]); 
}

export { useFunctionDebounce };
