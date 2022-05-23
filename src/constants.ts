export enum Inputs {
    Key = "key",
    Path = "path",
    ConnectionString = "connection-string",
    Container = "container",
    FailOnMiss = "fail-on-miss",
    Url = "url"
}

export enum Outputs {
    CacheHit = "cache-hit"
}

export enum State {
    CacheHit = "CACHE_HIT",
    CachePrimaryKey = "PRIMARY_KEY"
}

export enum Events {
    Key = "GITHUB_EVENT_NAME",
    Push = "push",
    PullRequest = "pull_request"
}

export const RefKey = "GITHUB_REF";
