import "fake-indexeddb/auto";
import { describeAdapterContract } from "./contract.ts";
import { IndexedDbStorageAdapter } from "./indexeddb.ts";
import { MemoryStorageAdapter } from "./memory.ts";
import { ScalableStorageAdapter } from "./scalable.ts";

describeAdapterContract({
  name: "ephemeral",
  create: () => new MemoryStorageAdapter(),
});

{
  const dbName = () => `todo-contract-idb-${crypto.randomUUID()}`;
  let persistentName = dbName();
  describeAdapterContract({
    name: "persistent",
    create: () => {
      persistentName = dbName();
      return new IndexedDbStorageAdapter(persistentName);
    },
    reopen: () => new IndexedDbStorageAdapter(persistentName),
  });
}

{
  const dbName = () => `todo-contract-scale-${crypto.randomUUID()}`;
  let scalableName = dbName();
  describeAdapterContract({
    name: "scalable",
    create: () => {
      scalableName = dbName();
      return new ScalableStorageAdapter(scalableName);
    },
    reopen: () => new ScalableStorageAdapter(scalableName),
  });
}
