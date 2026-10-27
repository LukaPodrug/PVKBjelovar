import { useEffect, useState } from "react";
import type { ProgramPayment } from "../lib/public-api";

type CodeType = "hub3" | "qr";

/**
 * Bank transfer details for a practice signup. Croatian mobile banking scans the HUB3 PDF417
 * barcode ("Slikaj i plati"), so it is shown first; the EPC QR code is there for apps that only read
 * QR. Everything is also written out for paying at a bank or typing it in manually.
 */
export function PaymentPanel({ payment }: { payment: ProgramPayment }) {
  const [codeType, setCodeType] = useState<CodeType>("hub3");
  const [codeImageUrl, setCodeImageUrl] = useState<string | null>(null);
  const [hasCodeError, setHasCodeError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setCodeImageUrl(null);
    setHasCodeError(false);

    // The barcode libraries are only needed after a signup, so they load on demand.
    const renderCode = async () => {
      if (codeType === "hub3") {
        const bwipjs = await import("bwip-js/browser");
        // HUB3 settings: PDF417 with 9 data columns and error correction level 4. bwip-js passes
        // these symbology options through to BWIPP, but its typings don't list them.
        const options = {
          bcid: "pdf417",
          text: payment.hub3Text,
          columns: 9,
          eclevel: 4,
          rowmult: 3,
        };
        return bwipjs.toSVG(options);
      }

      const qrcode = await import("qrcode");
      return qrcode.toString(payment.epcQrText, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
    };

    renderCode()
      .then((svg) => {
        if (!isCancelled) {
          setCodeImageUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHasCodeError(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [codeType, payment.epcQrText, payment.hub3Text]);

  const recipientLines = [payment.recipient, payment.recipientAddress, payment.recipientCity].filter(
    (line): line is string => Boolean(line),
  );

  return (
    <div className="landing-payment">
      <div className="landing-payment-switch" role="tablist" aria-label="Vrsta koda za plaćanje">
        <button
          className={`landing-signup-tab ${codeType === "hub3" ? "is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={codeType === "hub3"}
          onClick={() => setCodeType("hub3")}
        >
          Barkod (HUB3)
        </button>
        <button
          className={`landing-signup-tab ${codeType === "qr" ? "is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={codeType === "qr"}
          onClick={() => setCodeType("qr")}
        >
          QR kod
        </button>
      </div>

      <div className={`landing-payment-code ${codeType === "qr" ? "is-qr" : ""}`}>
        {codeImageUrl ? (
          <img
            src={codeImageUrl}
            alt={codeType === "hub3" ? "HUB3 barkod za plaćanje" : "QR kod za plaćanje"}
          />
        ) : hasCodeError ? (
          <p className="text-sm text-muted">Kod trenutno nije moguće prikazati. Platite prema podacima ispod.</p>
        ) : (
          <p className="text-sm text-muted">Priprema koda...</p>
        )}
      </div>
      <p className="landing-copy text-center text-sm">
        {codeType === "hub3"
          ? "Skenirajte barkod u mobilnom bankarstvu (Slikaj i plati)."
          : "Skenirajte QR kod ako vaša bankovna aplikacija ne čita barkod."}
      </p>

      <dl className="landing-payment-details">
        <PaymentDetail label="Iznos" value={`${payment.amount.replace(".", ",")} ${payment.currency}`} />
        <PaymentDetail label="Primatelj" value={recipientLines.join(", ")} />
        <PaymentDetail label="IBAN" value={formatIban(payment.iban)} />
        {payment.bankName ? <PaymentDetail label="Banka" value={payment.bankName} /> : null}
        {/* Membership payments carry no reference (model HR99), like the ones from the parent app. */}
        {payment.reference ? (
          <>
            <PaymentDetail label="Model" value={payment.model} />
            <PaymentDetail label="Poziv na broj" value={payment.reference} />
          </>
        ) : null}
        <PaymentDetail label="Opis plaćanja" value={payment.description} />
      </dl>
    </div>
  );
}

function PaymentDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="landing-payment-detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatIban(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
