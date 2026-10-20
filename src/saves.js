const request = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export async function openSaves(){
  const r=indexedDB.open('lamar-browser-reconstruction',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('files');const db=await request(r);
  const store=mode=>db.transaction('files',mode).objectStore('files');
  return {
    read:async()=>await request(store('readonly').get('/saves/game.json')),
    write:async state=>await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(structuredClone(state),'/saves/game.json');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save aborted'));}),
    close:()=>db.close()
  };
}
