// Firebase backend for Mini MEP: anonymous sign-in (no accounts) + Firestore.
const V = '10.12.2';
const SDK = `https://www.gstatic.com/firebasejs/${V}`;

export async function connect(config) {
  const [{ initializeApp }, { getAuth, signInAnonymously }, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where } = fs;
  const app = initializeApp(config);
  const cred = await signInAnonymously(getAuth(app));   // the id survives reloads in this browser
  const uid = cred.user.uid;
  const db = getFirestore(app);
  const session = pin => doc(db, 'sessions', pin);
  const player = (pin, id) => doc(db, 'sessions', pin, 'players', id);
  const onErr = e => console.error('Mini MEP:', e);

  return {
    uid,
    async getSession(pin) { const s = await getDoc(session(pin)); return s.exists() ? s.data() : null; },
    watchSession(pin, cb) { return onSnapshot(session(pin), s => cb(s.exists() ? s.data() : null), onErr); },
    watchPlayers(pin, cb) {
      return onSnapshot(collection(db, 'sessions', pin, 'players'),
        q => cb(q.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);
    },
    setPlayer(pin, data) { return setDoc(player(pin, uid), data); },
    async listMySessions() {        // the rules only allow listing your own games
      const q = await getDocs(query(collection(db, 'sessions'), where('hostUid', '==', uid)));
      return q.docs.map(d => ({ pin: d.id, ...d.data() }));
    },
    createSession(pin, data) { return setDoc(session(pin), { ...data, hostUid: uid }); },
    updateSession(pin, patch) { return updateDoc(session(pin), patch); },
    removePlayer(pin, id) { return deleteDoc(player(pin, id)); },
  };
}
