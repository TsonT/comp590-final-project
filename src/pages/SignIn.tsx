import {
  AuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { FC, useState } from "react";
import Alert from "../components/Alert";
import { Navigate } from "react-router-dom";
import { auth } from "../shared/firebase";
import { useQueryParams } from "../hooks/useQueryParams";
import { useStore } from "../store";
import sodium from "libsodium-wrappers";
import { db } from "../shared/firebase";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const SignIn: FC = () => {
  const { redirect } = useQueryParams();

  const currentUser = useStore((state) => state.currentUser);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAlertOpened, setIsAlertOpened] = useState(false);

  // Function to generate the bundle
  // TODO generate more prekeys
  const generateBundle = async () => {
    await sodium.ready;
    const generateKeyPair = () => sodium.crypto_kx_keypair();

    const identityKeyPair = sodium.crypto_sign_keypair();
    const identityPublicKey = identityKeyPair.publicKey;
    const identityPrivateKey = identityKeyPair.privateKey;

    const signedPrekeyPair = generateKeyPair();
    const signedPrekeyPublicKey = signedPrekeyPair.publicKey;
    const signedPrekeyPrivateKey = signedPrekeyPair.privateKey;

    const oneTimePrekeyPair = generateKeyPair();
    const oneTimePrekeyPublicKey = oneTimePrekeyPair.publicKey;
    const oneTimePrekeyPrivateKey = oneTimePrekeyPair.privateKey;

    const bundle = {
      identityKey: identityPublicKey,
      signedPrekey: signedPrekeyPublicKey,
      signedPrekeySignature: sodium.crypto_sign_detached(
        signedPrekeyPublicKey,
        identityPrivateKey
      ),
      oneTimePrekeys: [oneTimePrekeyPublicKey],
    };

    return bundle;
  };

  const storeBundle = async (bundle: any, user: any) => {
    const bundleWithBase64 = {
      identityKey: btoa(String.fromCharCode.apply(null, bundle.identityKey)),
      signedPrekey: btoa(String.fromCharCode.apply(null, bundle.signedPrekey)),
      signedPrekeySignature: btoa(
        String.fromCharCode.apply(null, bundle.signedPrekeySignature)
      ),
      oneTimePrekeys: bundle.oneTimePrekeys.map((key: Uint8Array) =>
        btoa(String.fromCharCode.apply(null, key))
      ),
    };

    updateDoc(doc(db, "users", user.uid), {
      bundle: bundleWithBase64,
    });
  };

  const handleSignIn = async (provider: AuthProvider) => {
    setLoading(true);

    try {
      signInWithPopup(auth, provider)
        .then(async (res) => {
          console.log(res.user);
          const bundle = await generateBundle();
          storeBundle(bundle, res.user);
        })
        .catch((err) => {
          setIsAlertOpened(true);
          setError(`Error: ${err.code}`);
        })
        .finally(() => {
          setLoading(false);
        });
    } catch (err) {
      setIsAlertOpened(true);
      setError(`Error generating bundle: ${err.message}`);
      setLoading(false);
    }
  };

  if (currentUser) return <Navigate to={redirect || "/"} />;

  return (
    <>
      <div className="mx-[5vw] my-5 flex justify-center lg:my-10">
        <div className="w-full max-w-[1100px]">
          <div className="flex justify-between">
            <div className="flex items-center gap-2">
              <img className="h-8 w-8" src="/icon.svg" alt="" />
              <span className="text-2xl">TarChat</span>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-10 md:mt-5 md:flex-row md:gap-5 lg:mt-10">
            <div className="flex-1">
              <img className="h-auto w-full" src="/illustration.svg" alt="" />
            </div>

            <div className="mt-12 flex flex-1 flex-col items-center gap-4 md:items-start lg:mt-24">
              <h1 className="text-center text-3xl md:text-left md:text-4xl">
                The best place for messaging
              </h1>
              <p className="text-center text-xl md:text-left md:text-2xl">
                It's free, fast and secure. We make it easy and fun to stay
                close to your favourite people.
              </p>

              <button
                disabled={loading}
                onClick={() => handleSignIn(new GoogleAuthProvider())}
                className="flex min-w-[250px] cursor-pointer items-center gap-3 rounded-md bg-white p-3 text-black transition duration-300 hover:brightness-90 disabled:!cursor-default disabled:!brightness-75"
              >
                <img className="h-6 w-6" src="/google.svg" alt="" />

                <span>Sign In With Google</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <Alert
        isOpened={isAlertOpened}
        setIsOpened={setIsAlertOpened}
        text={error}
        isError
      />
    </>
  );
};

export default SignIn;
