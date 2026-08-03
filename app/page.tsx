import MapExperience from "../components/MapExperience";
import summary from "../data/processed/atlas-summary.json";

// The large record collection is fetched as compressed static JSON by the client.
// Keeping it out of the server-rendered props makes the initial HTML load immediately.
export default function Page() {
  return <MapExperience summary={summary as any} />;
}
