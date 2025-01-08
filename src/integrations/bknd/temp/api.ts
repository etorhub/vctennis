// Generated API route for bknd adapter
import { serve } from "bknd/adapter/astro";

export const prerender = false;

export const ALL = serve(
{
  "connection": {
    "type": "libsql",
    "config": {
      "url": "libsql://freedom-stack-db-etorhub.turso.io",
      "authToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MzYzNzA2MTIsImlkIjoiMjMwN2FlYTItZDJjNC00ZDQ1LTg4ZTktZGY2NWQ2ZTk3ZDI1In0.BdO7Q3uAQbvJKety7xhsCyhJIglzfQVduZneQ1ti3BsvCIzmERzdPsXV_Ij9AdyzvO2RzfNm6xiULJ18eh2tBQ"
    }
  }
}
);
