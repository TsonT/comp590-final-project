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
import { encodeUint8ArrayPropsToBase64 } from "../shared/utils";
import fs from "fs";

//Now import this
import "firebase/firestore";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs, //Deals with firebase
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
        identityPrivateKey //signing with the private key. Signature is stored but not the private key it signs with
      ),
      oneTimePrekeys: [oneTimePrekeyPublicKey],
    };

    return bundle;
  };

  const saveKeysToLocalStorage = (privateKeys: any) => {
    try {
      localStorage.setItem("privateKeys", JSON.stringify(privateKeys));
    } catch (error) {
      console.error("Error saving keys to local storage:", error);
    }
  };

  const storeBundle = async (bundle: any, user: any) => {
    const bundleWithBase64 = encodeUint8ArrayPropsToBase64(bundle);

    updateDoc(doc(db, "users", user.uid), {
      bundle: bundleWithBase64,
    });
  };

  const fetchListenerUId = async (userUid: string) => {
    try {
      const userDocRef = doc(db, "users", userUid);
      const userDocRefSnapshot = await getDoc(userDocRef);

      if (!userDocRefSnapshot.exists()) {
        console.log("User does not exist");
        return null;
      }

      const userData = userDocRefSnapshot.data();
      if (userData && userData.users) {
        const users = userData.users;

        const currentUserId = currentUser?.uid || "";

        const listenerUId = users.find(
          (userId: string) => userId !== currentUserId
        );

        return listenerUId;
      } else {
        console.log("User data or users field not found");
        return null;
      }
    } catch (error) {
      console.error("Error fetching listener UId:", error);
      return null;
    }
  };

  const userExistsInDatabase = async (userId: any) => {
    try {
      const userDocRef = doc(db, "users", userId);
      const userDocSnapshot = await getDoc(userDocRef);

      if (userDocSnapshot.exists()) {
        const userData = userDocSnapshot.data();

        if (userData) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Error checking user existence:", error);
      return false;
    }
  };
  const getKeysFromLocalStorage = () => {
    try {
      const keysJSON = localStorage.getItem("privateKeys");
      return keysJSON ? JSON.parse(keysJSON) : null;
    } catch (error) {
      console.error("Error retrieving keys from local storage:", error);
      return null;
    }
  };

  const storeBundlesLocally = (bundles: any) => {
    try {
      localStorage.setItem("bundles", JSON.stringify(bundles));
    } catch (error) {
      console.error("Error saving bundles to local storage:", error);
    }
  };

  const handleSignIn = async (provider: any) => {
    setLoading(true);

    try {
      signInWithPopup(auth, provider)
        .then(async (res) => {
          // Check if it's the user's first sign-in
          const userExists = await userExistsInDatabase(res.user.uid);
          if (!userExists) {
            const bundle = await generateBundle();

            console.log("First time user");
            const privateKeys = {
              identityPrivateKey: bundle.identityKey,
              signedPrekeyPrivateKey: bundle.signedPrekey,
              oneTimePrekeyPrivateKey: bundle.oneTimePrekeys[0],
            };
            saveKeysToLocalStorage(privateKeys);

            storeBundle(bundle, res.user);
            console.log(getKeysFromLocalStorage());
          } else {
            console.log("Returning user");
          }
          console.log(res.user);
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
              <span className="text-unc-blue font-fun text-2xl">TarChat</span>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-10 md:mt-5 md:flex-row md:gap-5 lg:mt-10">
            <div className="flex-1">
              <img className="h-auto w-full" src="/illustration.svg" alt="" />
            </div>

            <div className="mt-12 flex flex-1 flex-col items-center gap-4 md:items-start lg:mt-24">
              <h1 className="text-center text-3xl md:text-left md:text-4xl">
                A chat by Tarheels, for Tarheels
              </h1>
              <p className="text-unc-blue font-fun text-center text-xl md:text-left md:text-2xl">
                It's free, fast and secure. We make it easy and fun to stay
                close to your favourite people with TarChat.
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
