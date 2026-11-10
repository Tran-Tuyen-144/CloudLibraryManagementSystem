import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  fetchCatalogPage,
  mergeCatalogBooks,
} from "../api/catalog.js";

import { ApiError } from "../api/client.js";

export default function useApiCatalog(query) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(null);

  const moreRequest = useRef(null);

  const queryKey = JSON.stringify({
    q: query.q,
    category: query.category,
    availability: query.availability,
    sort: query.sort,
  });

  const requestKey = `${queryKey}:${attempt}`;

  const current =
    state?.key === requestKey ? state : null;

  useEffect(() => {
    const controller = new AbortController();

    const timer = window.setTimeout(
      async () => {
        try {
          const page = await fetchCatalogPage(
            JSON.parse(queryKey),
            { signal: controller.signal },
          );

          if (!controller.signal.aborted) {
            setState({
              ...page,
              key: requestKey,
              error: null,
              moreError: null,
              loadingMore: false,
              cursors: [],
            });
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setState({
              key: requestKey,
              items: [],
              nextCursor: null,
              total: null,
              error,
              moreError: null,
              loadingMore: false,
              cursors: [],
            });
          }
        }
      },
      250,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();

      moreRequest.current?.abort();
      moreRequest.current = null;
    };
  }, [queryKey, requestKey]);

  async function loadMore() {
    if (
      !current?.nextCursor ||
      current.loadingMore ||
      moreRequest.current
    ) {
      return;
    }

    const cursor = current.nextCursor;
    const controller = new AbortController();

    moreRequest.current = controller;

    setState((previous) =>
      previous?.key === requestKey
        ? {
            ...previous,
            loadingMore: true,
            moreError: null,
          }
        : previous,
    );

    try {
      const page = await fetchCatalogPage(
        {
          ...JSON.parse(queryKey),
          cursor,
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      if (
        page.nextCursor === cursor ||
        (page.nextCursor &&
          current.cursors.includes(
            page.nextCursor,
          ))
      ) {
        throw new ApiError(
          "invalidResponse",
          "Con trỏ phân trang bị lặp.",
        );
      }

      setState((previous) =>
        previous?.key === requestKey
          ? {
              ...previous,

              items: mergeCatalogBooks(
                previous.items,
                page.items,
              ),

              nextCursor: page.nextCursor,
              total:
                page.total ?? previous.total,
              loadingMore: false,
              moreError: null,

              cursors: [
                ...previous.cursors,
                cursor,
              ],
            }
          : previous,
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setState((previous) =>
          previous?.key === requestKey
            ? {
                ...previous,
                loadingMore: false,
                moreError: error,
              }
            : previous,
        );
      }
    } finally {
      if (
        moreRequest.current === controller
      ) {
        moreRequest.current = null;
      }
    }
  }

  return {
    items: current?.items || [],
    total: current?.total ?? null,
    loading: !current,
    error: current?.error || null,
    nextCursor: current?.nextCursor || null,
    loadingMore:
      current?.loadingMore || false,
    moreError: current?.moreError || null,

    reload: () =>
      setAttempt((value) => value + 1),

    loadMore,
  };
}