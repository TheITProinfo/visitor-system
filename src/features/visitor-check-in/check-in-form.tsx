"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { searchActiveHosts, submitVisitorCheckIn, type CheckInActionResult } from "@/features/visitor-check-in/actions";
import { SignaturePad } from "@/features/visitor-check-in/signature-pad";

type HostOption = { id: string; name: string; department: string };
type VisitorProfileOption = { id: string; fullName: string; emailHint: string };
type PurposeOption = { id: string; name: string };
type Props = { initialToken: string; companyName: string; agreementText: string; purposes: PurposeOption[] };
type VisitorDetails = {
  fullName: string;
  isPersonalVisit: boolean;
  companyName: string;
  email: string;
  phone: string;
  isDriving: boolean;
  vehicleRegistrationNumber: string;
};

const EMPTY_VISITOR: VisitorDetails = {
  fullName: "", isPersonalVisit: false, companyName: "", email: "", phone: "", isDriving: false, vehicleRegistrationNumber: "",
};

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("This photo could not be opened.")); };
    image.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const maxBytes = 850 * 1024;
      let scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
      let quality = 0.82;
      try {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));
          if (!blob) throw new Error("This browser could not prepare the photo.");
          if (blob.size <= maxBytes) {
            const dataUrl = await new Promise<string>((done, fail) => {
              const reader = new FileReader();
              reader.onload = () => done(String(reader.result));
              reader.onerror = () => fail(new Error("This photo could not be read."));
              reader.readAsDataURL(blob);
            });
            resolve(dataUrl.split(",")[1] || "");
            return;
          }
          if (quality > 0.58) quality -= 0.08;
          else scale *= 0.78;
        }
        throw new Error("The photo is too large. Please take another photo.");
      } catch (error) {
        reject(error instanceof Error ? error : new Error("This photo could not be prepared."));
      }
    };
    image.src = objectUrl;
  });
}

const ERROR_COPY: Record<Exclude<CheckInActionResult, { ok: true }> ["code"], string> = {
  invalid: "Please review each required field, accept the agreement, and provide a signature and photo.",
  "host-unavailable": "That person is no longer available in the staff directory. Search again or ask reception for assistance.",
  "purpose-unavailable": "That visit purpose is no longer available. Choose another purpose or ask reception for assistance.",
  "agreement-unavailable": "The visitor agreement is not configured. Please ask reception for assistance.",
  "profile-unavailable": "We could not verify the saved visitor profile. Search again or enter your details manually.",
  failed: "We could not save your check-in. Please try once more or ask reception for help.",
};

export function CheckInForm({ initialToken, companyName, agreementText, purposes }: Props) {
  const [step, setStep] = useState(1);
  const [visitor, setVisitor] = useState(EMPTY_VISITOR);
  const [profileOptions, setProfileOptions] = useState<VisitorProfileOption[]>([]);
  const [profileCandidate, setProfileCandidate] = useState<VisitorProfileOption | null>(null);
  const [visitorProfileId, setVisitorProfileId] = useState("");
  const [profileEmailVerified, setProfileEmailVerified] = useState("");
  const [saveProfileUpdates, setSaveProfileUpdates] = useState(false);
  const [skipProfileLookup, setSkipProfileLookup] = useState(false);
  const [profileVerificationEmail, setProfileVerificationEmail] = useState("");
  const [profileLookupState, setProfileLookupState] = useState<"idle" | "searching" | "options" | "confirming" | "loaded" | "not-found" | "failed" | "verify-failed">("idle");
  const [profileHasMore, setProfileHasMore] = useState(false);
  const [hostQuery, setHostQuery] = useState("");
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const [selectedHost, setSelectedHost] = useState<HostOption | null>(null);
  const [hostStatus, setHostStatus] = useState<"idle" | "searching" | "none" | "failed">("idle");
  const [purposeId, setPurposeId] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [photoData, setPhotoData] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ hostName: string; companyName: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkInToken, setCheckInToken] = useState(initialToken);
  const formRef = useRef<HTMLFormElement>(null);
  const idleAt = useRef(0);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const query = hostQuery.trim();
    if (!query || query.length < 2 || selectedHost) return;
    const timer = window.setTimeout(() => {
      void searchActiveHosts(query).then((result) => {
        if (!active) return;
        setHosts(result);
        setHostStatus(result.length ? "idle" : "none");
      }).catch(() => { if (active) setHostStatus("failed"); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [hostQuery, selectedHost]);

  useEffect(() => {
    const name = visitor.fullName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || visitorProfileId || skipProfileLookup) return;

    let active = true;
    const timer = window.setTimeout(() => {
      setProfileLookupState("searching");
      void fetch(`/api/visitor-profile/search?name=${encodeURIComponent(name)}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Profile search failed");
          return response.json() as Promise<{ profiles: VisitorProfileOption[]; hasMore: boolean }>;
        })
        .then((result) => {
          if (!active) return;
          setProfileOptions(result.profiles);
          setProfileHasMore(result.hasMore);
          const uniqueMatch = result.profiles.length === 1 && !result.hasMore;
          setProfileCandidate(uniqueMatch ? result.profiles[0] : null);
          setProfileLookupState(result.profiles.length ? "options" : "not-found");
        })
        .catch(() => { if (active) setProfileLookupState("failed"); });
    }, 500);

    return () => { active = false; window.clearTimeout(timer); };
  }, [visitor.fullName, visitorProfileId, skipProfileLookup]);

  useEffect(() => {
    idleAt.current = Date.now();
    const resetIdle = () => { idleAt.current = Date.now(); };
    const interval = window.setInterval(() => {
      if (!success && idleAt.current > 0 && Date.now() - idleAt.current > 5 * 60 * 1000) router.push("/");
    }, 30_000);
    window.addEventListener("pointerdown", resetIdle);
    window.addEventListener("keydown", resetIdle);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", resetIdle);
      window.removeEventListener("keydown", resetIdle);
    };
  }, [router, success]);

  function setVisitorField<K extends keyof VisitorDetails>(key: K, value: VisitorDetails[K]) {
    setVisitor((current) => ({ ...current, [key]: value }));
  }

  function changeVisitorName(fullName: string) {
    setSkipProfileLookup(false);
    if (visitorProfileId) {
      setVisitor({ ...EMPTY_VISITOR, fullName });
      setVisitorProfileId("");
      setProfileEmailVerified("");
      setSaveProfileUpdates(false);
      setProfileVerificationEmail("");
    } else {
      setVisitorField("fullName", fullName);
    }
    setProfileOptions([]);
    setProfileCandidate(null);
    setProfileHasMore(false);
    setProfileLookupState(fullName.trim().length >= 2 ? "searching" : "idle");
  }

  function changeVisitorEmail(email: string) {
    setVisitorField("email", email);
    if (visitorProfileId && email.trim().toLowerCase() !== profileEmailVerified) {
      setVisitorProfileId("");
      setProfileEmailVerified("");
      setSaveProfileUpdates(false);
      setSkipProfileLookup(true);
      setProfileLookupState("idle");
    }
  }

  async function loadReturningVisitor() {
    if (!profileCandidate || !profileVerificationEmail.trim()) return;
    setProfileLookupState("confirming");
    try {
      const response = await fetch("/api/visitor-profile/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ profileId: profileCandidate.id, email: profileVerificationEmail.trim() }),
      });
      if (!response.ok) {
        setProfileLookupState("verify-failed");
        return;
      }
      const profile = await response.json() as { id: string; fullName: string; email: string | null; phoneNumber: string | null; company: string | null; vehiclePlate: string | null };
      setVisitor((current) => ({
        ...current,
        fullName: profile.fullName,
        email: profile.email || profileVerificationEmail.trim(),
        phone: profile.phoneNumber || "",
        companyName: profile.company || "",
        isPersonalVisit: !profile.company,
        vehicleRegistrationNumber: profile.vehiclePlate || "",
        isDriving: Boolean(profile.vehiclePlate),
      }));
      setVisitorProfileId(profile.id);
      setProfileEmailVerified((profile.email || profileVerificationEmail).trim().toLowerCase());
      setSaveProfileUpdates(false);
      setSkipProfileLookup(false);
      setProfileCandidate(null);
      setProfileOptions([]);
      setProfileLookupState("loaded");
    } catch {
      setProfileLookupState("failed");
    }
  }

  function clearReturningVisitor() {
    setVisitor((current) => ({ ...EMPTY_VISITOR, fullName: current.fullName }));
    setVisitorProfileId("");
    setProfileEmailVerified("");
    setSaveProfileUpdates(false);
    setSkipProfileLookup(true);
    setProfileCandidate(null);
    setProfileOptions([]);
    setProfileVerificationEmail("");
    setProfileHasMore(false);
    setProfileLookupState("idle");
  }

  function continueFromDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setError("");
    setStep(2);
  }

  async function finishCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHost || !purposeId || !agreed || !signatureData || !photoData) {
      setError("Complete the visit details and capture your agreement, signature, and photo before checking in.");
      return;
    }
    const form = formRef.current;
    if (!form) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await submitVisitorCheckIn(new FormData(form));
      if (!result.ok) {
        setError(ERROR_COPY[result.code]);
        if (result.code === "host-unavailable") setStep(2);
        return;
      }
      setSuccess(result);
      setVisitor(EMPTY_VISITOR);
      setHostQuery("");
      setSelectedHost(null);
      setHosts([]);
      setPurposeId("");
      setSignatureData("");
      setPhotoData("");
      setPhotoPreview("");
      setAgreed(false);
      setStep(1);
      setCheckInToken(crypto.randomUUID());
    } catch {
      setError(ERROR_COPY.failed);
    } finally {
      setSubmitting(false);
    }
  }

  async function onPhotoChange(file?: File) {
    setPhotoError("");
    setPhotoData("");
    setPhotoPreview("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file or use the camera.");
      return;
    }
    try {
      const data = await compressPhoto(file);
      setPhotoData(data);
      setPhotoPreview(`data:image/jpeg;base64,${data}`);
    } catch (issue) {
      setPhotoError(issue instanceof Error ? issue.message : "This photo could not be prepared.");
    }
  }

  function restart() {
    setSuccess(null);
    setVisitor(EMPTY_VISITOR);
    setVisitorProfileId("");
    setProfileEmailVerified("");
    setSaveProfileUpdates(false);
    setSkipProfileLookup(false);
    setProfileOptions([]);
    setProfileCandidate(null);
    setProfileVerificationEmail("");
    setProfileLookupState("idle");
    setHostQuery("");
    setSelectedHost(null);
    setPurposeId("");
    setSignatureData("");
    setPhotoData("");
    setPhotoPreview("");
    setAgreed(false);
    setError("");
    setCheckInToken(crypto.randomUUID());
    idleAt.current = Date.now();
  }

  if (success) {
    return (
      <section className="visitor-success" role="status">
        <span className="visitor-success-icon" aria-hidden="true">✓</span>
        <p className="visitor-eyebrow">ARRIVAL RECORDED</p>
        <h1>Check-in complete</h1>
        <p>Your visit to {success.companyName} with {success.hostName} is checked in.</p>
        <p className="visitor-success-note">Please collect your visitor badge at the reception tablet.</p>
        <div className="visitor-success-actions"><button className="visitor-primary" type="button" onClick={restart}>Start another check-in <span>→</span></button><Link href="/" className="visitor-secondary">Return to welcome</Link></div>
      </section>
    );
  }

  return (
    <form ref={formRef} className="visitor-flow" onSubmit={step === 1 ? continueFromDetails : finishCheckIn}>
      <input type="hidden" name="fullName" value={visitor.fullName} />
      <input type="hidden" name="isPersonalVisit" value={String(visitor.isPersonalVisit)} />
      <input type="hidden" name="visitorCompanyName" value={visitor.companyName} />
      <input type="hidden" name="visitorEmail" value={visitor.email} />
      <input type="hidden" name="visitorPhone" value={visitor.phone} />
      <input type="hidden" name="isDriving" value={String(visitor.isDriving)} />
      <input type="hidden" name="vehicleRegistrationNumber" value={visitor.vehicleRegistrationNumber} />
      <input type="hidden" name="visitorProfileId" value={visitorProfileId} />
      <input type="hidden" name="updateVisitorProfile" value={String(saveProfileUpdates)} />
      <input type="hidden" name="hostId" value={selectedHost?.id || ""} />
      <input type="hidden" name="purposeId" value={purposeId} />
      <input type="hidden" name="checkInToken" value={checkInToken} />
      <input type="hidden" name="signatureData" value={signatureData} />
      <input type="hidden" name="photoData" value={photoData} />
      <input type="hidden" name="agreed" value={String(agreed)} />

      <div className="visitor-stepper" aria-label={`Step ${step} of 3`}>
        {["Your details", "Visit details", "Agreement & photo"].map((label, index) => <div className={`visitor-step-marker ${step === index + 1 ? "current" : step > index + 1 ? "complete" : ""}`} key={label}><span>{step > index + 1 ? "✓" : index + 1}</span><small>{label}</small></div>)}
      </div>
      {error && <p className="visitor-alert" role="alert">{error}</p>}

      {step === 1 && <section className="visitor-card">
        <div className="visitor-card-heading"><div><p className="visitor-eyebrow">STEP 1 OF 3</p><h2>Your details</h2><p>Tell us who you are. Your details are used for this visit.</p></div><span className="visitor-heading-icon">01</span></div>
        <div className="visitor-fields">
          <div className="visitor-field visitor-field-wide">
            <label htmlFor="visitor-full-name">Full name</label>
            <input id="visitor-full-name" autoComplete="name" maxLength={160} required value={visitor.fullName} onChange={(event) => changeVisitorName(event.target.value)} placeholder="Enter your full name" />
            {profileLookupState === "searching" && <small className="visitor-hint">Checking for a returning visitor…</small>}
            {profileLookupState === "failed" && <small className="visitor-field-error">We could not check saved visitor details. You can continue and enter your details manually.</small>}
            {profileLookupState === "not-found" && <small className="visitor-hint">No saved profile found. Enter your details below as a new visitor.</small>}
            {profileLookupState === "loaded" && <><div className="selected-host"><span><strong>Returning visitor</strong><small>Saved details loaded. You can edit them for this visit.</small></span><button type="button" onClick={clearReturningVisitor}>Clear profile</button></div><label className="returning-visitor-save"><input type="checkbox" checked={saveProfileUpdates} onChange={(event) => setSaveProfileUpdates(event.target.checked)} /><span><strong>Save these changes to my profile for next time</strong><small>Leave unchecked to keep this visit separate from your saved details.</small></span></label></>}
            {profileCandidate && profileLookupState !== "loaded" && <div className="selected-host"><span><strong>Returning visitor found</strong><small>{profileCandidate.fullName} · {profileCandidate.emailHint}</small></span></div>}
            {profileOptions.length > 0 && !profileCandidate && <ul className="host-results" aria-label="Returning visitor matches">{profileOptions.map((profile) => <li key={profile.id}><button type="button" onClick={() => { setProfileCandidate(profile); setProfileVerificationEmail(visitor.email); setProfileLookupState("options"); }}><span><strong>{profile.fullName}</strong><small>{profile.emailHint}</small></span><span aria-hidden="true">→</span></button></li>)}</ul>}
            {profileHasMore && <small className="visitor-hint">More than five profiles match. Enter more of your name to narrow the results.</small>}
            {profileCandidate && profileLookupState !== "loaded" && <div className="returning-visitor-confirm">
              <label htmlFor="profile-verification-email">Confirm the email saved on your profile</label>
              <input id="profile-verification-email" type="email" autoComplete="email" maxLength={254} value={profileVerificationEmail} onChange={(event) => setProfileVerificationEmail(event.target.value)} placeholder="Enter your saved email address" />
              {profileLookupState === "verify-failed" && <small className="visitor-field-error">Those details did not match. Check the email or continue as a new visitor.</small>}
              <button className="visitor-secondary" type="button" disabled={profileLookupState === "confirming" || !profileVerificationEmail.trim()} onClick={() => void loadReturningVisitor()}>{profileLookupState === "confirming" ? "Checking…" : "Confirm & load saved details"}</button>
            </div>}
          </div>
          <fieldset className="visitor-choice visitor-field-wide"><legend>Visit type</legend><label><input type="radio" name="visitType" checked={!visitor.isPersonalVisit} onChange={() => setVisitorField("isPersonalVisit", false)} /> Company visit</label><label><input type="radio" name="visitType" checked={visitor.isPersonalVisit} onChange={() => setVisitorField("isPersonalVisit", true)} /> Personal visit</label></fieldset>
          {!visitor.isPersonalVisit && <label className="visitor-field visitor-field-wide">Company name<input autoComplete="organization" maxLength={160} required={!visitor.isPersonalVisit} value={visitor.companyName} onChange={(event) => setVisitorField("companyName", event.target.value)} placeholder="Your organization" /></label>}
          <label className="visitor-field">Email address<input autoComplete="email" type="email" maxLength={254} required value={visitor.email} onChange={(event) => changeVisitorEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label className="visitor-field">Phone number<input autoComplete="tel" type="tel" maxLength={40} minLength={5} required value={visitor.phone} onChange={(event) => setVisitorField("phone", event.target.value)} placeholder="Your phone number" /></label>
          <fieldset className="visitor-choice visitor-field-wide"><legend>Are you driving?</legend><label><input type="radio" name="driving" checked={!visitor.isDriving} onChange={() => { setVisitorField("isDriving", false); setVisitorField("vehicleRegistrationNumber", ""); }} /> No</label><label><input type="radio" name="driving" checked={visitor.isDriving} onChange={() => setVisitorField("isDriving", true)} /> Yes</label></fieldset>
          {visitor.isDriving && <label className="visitor-field visitor-field-wide">Vehicle registration number<input autoCapitalize="characters" maxLength={24} required value={visitor.vehicleRegistrationNumber} onChange={(event) => setVisitorField("vehicleRegistrationNumber", event.target.value.toUpperCase())} placeholder="Enter your plate number" /></label>}
        </div>
        <div className="visitor-actions"><Link href="/" className="visitor-secondary">Cancel</Link><button className="visitor-primary" type="submit">Next: visit details <span>→</span></button></div>
      </section>}

      {step === 2 && <section className="visitor-card">
        <div className="visitor-card-heading"><div><p className="visitor-eyebrow">STEP 2 OF 3</p><h2>Who are you visiting?</h2><p>Choose your host and the purpose of your visit.</p></div><span className="visitor-heading-icon">02</span></div>
        <div className="visitor-fields visitor-fields-one">
          <div className="visitor-field visitor-field-wide"><label htmlFor="host-search">Person to visit</label><div className="visitor-search-wrap"><input id="host-search" autoComplete="off" value={selectedHost?.name || hostQuery} onChange={(event) => { const query = event.target.value; setSelectedHost(null); setHosts([]); setHostStatus(query.trim().length >= 2 ? "searching" : "idle"); setHostQuery(query); }} placeholder="Search first or last name" /></div>
            {hostStatus === "searching" && <small className="visitor-hint">Searching staff directory…</small>}
            {hostStatus === "failed" && <small className="visitor-field-error">We could not search the staff directory. Check your connection or ask reception.</small>}
            {hostStatus === "none" && <small className="visitor-field-error">Person not found. Please ask reception for assistance.</small>}
            {hosts.length > 0 && !selectedHost && <ul className="host-results" aria-label="Staff search results">{hosts.map((host) => <li key={host.id}><button type="button" onClick={() => { setSelectedHost(host); setHostQuery(""); setHosts([]); setHostStatus("idle"); }}><span><strong>{host.name}</strong><small>{host.department || "Staff"}</small></span><span aria-hidden="true">→</span></button></li>)}</ul>}
            {selectedHost && <div className="selected-host"><span><strong>{selectedHost.name}</strong><small>{selectedHost.department || "Staff"}</small></span><button type="button" onClick={() => { setSelectedHost(null); setHostQuery(""); }}>Change</button></div>}
          </div>
          <label className="visitor-field visitor-field-wide">Purpose of visit<select value={purposeId} required onChange={(event) => setPurposeId(event.target.value)}><option value="">Choose a purpose</option>{purposes.map((purpose) => <option key={purpose.id} value={purpose.id}>{purpose.name}</option>)}</select></label>
          {!purposes.length && <p className="visitor-field-error">No visit purposes are configured. Please ask reception for assistance.</p>}
        </div>
        <div className="visitor-actions"><button className="visitor-secondary" type="button" onClick={() => setStep(1)}>← Back</button><button className="visitor-primary" type="button" onClick={() => { if (!selectedHost || !purposeId) setError("Choose a person to visit and a purpose before continuing."); else { setError(""); setStep(3); } }}>Next: agreement <span>→</span></button></div>
      </section>}

      {step === 3 && <section className="visitor-card">
        <div className="visitor-card-heading"><div><p className="visitor-eyebrow">STEP 3 OF 3</p><h2>Agreement and photo</h2><p>Please review the visitor agreement, sign, and take a photo.</p></div><span className="visitor-heading-icon">03</span></div>
        <section className="visitor-agreement" aria-label="Visitor agreement"><p className="visitor-eyebrow">{companyName}</p><div>{agreementText || "The visitor agreement has not been configured. Please ask reception for assistance."}</div></section>
        <label className="visitor-agree"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />I have read and agree to the visitor terms above.</label>
        <div className="visitor-fields visitor-fields-one">
          <div className="visitor-field visitor-field-wide"><span className="visitor-label">Your signature</span><SignaturePad value={signatureData} onChange={setSignatureData} /></div>
          <div className="visitor-field visitor-field-wide"><label htmlFor="visitor-photo">Visitor photo</label><p className="visitor-hint">Take a clear photo of yourself. It is stored with this visit and is not emailed.</p><input id="visitor-photo" className="visitor-file-input" type="file" accept="image/*" capture="user" onChange={(event) => void onPhotoChange(event.target.files?.[0])} />{photoError && <small className="visitor-field-error">{photoError}</small>}{photoPreview && <div className="visitor-photo-preview"><NextImage src={photoPreview} width={132} height={132} alt="Preview of your visitor photo" unoptimized /><button type="button" className="text-action" onClick={() => { setPhotoData(""); setPhotoPreview(""); }}>Retake photo</button></div>}</div>
        </div>
        <div className="visitor-actions"><button className="visitor-secondary" type="button" onClick={() => setStep(2)}>← Back</button><button className="visitor-primary" type="submit" disabled={submitting || !agreementText || !purposes.length}>{submitting ? "Saving check-in…" : "Complete check-in"} <span>→</span></button></div>
        <p className="visitor-privacy-note">Please ask reception if your device cannot take a photo or capture your signature.</p>
      </section>}
    </form>
  );
}
