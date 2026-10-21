import { useQueries, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { Mutate } from 'zustand/vanilla';
import { queryClient } from './query';

export abstract class BaseSDK<State> {
    abstract readonly useStore: UseBoundStore<Mutate<StoreApi<State>, [['zustand/immer', never]]>>;
    readonly query: object = {};

    get state() { return this.useStore.getState(); }
    get setState() { return this.useStore.setState; }
    get subscribe() { return this.useStore.subscribe; }

    useWith = <Selected, const Queries extends readonly BaseSDK.Query[]>(
        selector: (state: State) => Selected,
        queries: (query: this['query']) => Queries,
    ) => {
        const results = useQueries({ queries: [...queries(this.query)] });
        const selected = this.useStore(selector);
        return [selected, results as BaseSDK.Results<Queries>] as const;
    };

    fetch = <T>(query: BaseSDK.Query<T>) => queryClient.fetchQuery(query);
    prefetch = (query: BaseSDK.Query) => queryClient.prefetchQuery(query);
    invalidate = (query: Pick<BaseSDK.Query, 'queryKey'>) => queryClient.invalidateQueries({ queryKey: query.queryKey });
    abstract cleanup(): void;
}

export namespace BaseSDK {
    export type Query<T = unknown> = Pick<UseQueryOptions<T>, 'queryKey' | 'queryFn' | 'staleTime' | 'enabled' | 'refetchInterval'>;
    export type Results<Q extends readonly Query[]> = {
        [K in keyof Q]: Q[K] extends Query<infer T> ? UseQueryResult<T, Error> : never
    };
}
