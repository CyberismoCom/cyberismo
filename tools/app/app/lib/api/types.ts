import { Project, CardDetails } from "../definitions";

import { SWRResponse } from "swr";


export type Resources = {
    project: Project,
    card: CardDetails,
}

export type ResourceName = keyof Resources;

export type SwrResult<T extends ResourceName> = {
    [key in T]: Resources[T] | null;
} & Omit<SWRResponse<Resources[T]>, 'data'>;

export type FullCardUpdate = {
    content: string,
    metadata: Record<string, any>,
    state: { name: string }
}

export type CardUpdate = Partial<FullCardUpdate>
