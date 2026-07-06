export interface Feed {
  id: number;
  url: string;
  title: string | null;
  active: number;
  created_at: string;
}

export interface Edition {
  id: number;
  bucket: string;
  title: string;
  created_at: string;
  articles?: Article[];
}

export interface Article {
  id: number;
  title: string;
  description: string;
  link: string;
  image_url: string | null;
  source: string;
  pub_date: string;
  summary: string;
  summary_fallback: number;
  position: number;
}
