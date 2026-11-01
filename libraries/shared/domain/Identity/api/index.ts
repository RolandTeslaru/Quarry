import { z } from "zod"
import type { AxiosInstance } from "axios"
import { User as UserD } from "../User"
import { Group as GroupD } from "../Group"

/** Identity's HTTP surface — mirrors me.controller and users.controller. */
export namespace API {

    export namespace Me {
        export namespace Get {
            export const Response = z.object({ user: UserD.Schema })
            export type  Response = z.infer<typeof Response>
        }

        export async function get(api: AxiosInstance): Promise<Get.Response> {
            const { data } = await api.get("/api/me")
            return Get.Response.parse(data)
        }
    }

    export namespace Users {
        export namespace List {
            export const Response = z.object({ users: UserD.Schema.array() })
            export type  Response = z.infer<typeof Response>
        }

        export async function list(api: AxiosInstance): Promise<List.Response> {
            const { data } = await api.get("/api/users")
            return List.Response.parse(data)
        }
    }

    export namespace Groups {
        export namespace List {
            export const Response = z.object({ groups: GroupD.Schema.array() })
            export type  Response = z.infer<typeof Response>
        }

        export async function list(api: AxiosInstance): Promise<List.Response> {
            const { data } = await api.get("/api/groups")
            return List.Response.parse(data)
        }
    }
}
