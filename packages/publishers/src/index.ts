export interface PublicationRequest {
  readonly storyId: string;
  readonly artifactId: string;
  readonly connectionId: string;
}

export interface PublicationResult {
  readonly externalId: string;
  readonly url?: string;
}

export interface Publisher {
  readonly provider: string;
  publish(request: PublicationRequest): Promise<PublicationResult>;
}
