import crypto from "crypto";


/* =========================================================
   GOOGLE SHEETS WEBHOOK
   ========================================================= */

const GOOGLE_SHEET_WEBHOOK_URL =
    "https://script.google.com/macros/s/AKfycbxrI0jlMGLfDLu0eL-KuShfwHbZmNhOdW-fzNMAEugq_hauTBVepOAxrOgmhtYWR-vn/exec";


/* =========================================================
   READ RAW REQUEST BODY
   Required because Zoho signature is calculated from
   the exact original payload.
   ========================================================= */

function getRawBody(req) {

    return new Promise((resolve, reject) => {

        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            resolve(body);
        });

        req.on("error", error => {
            reject(error);
        });

    });

}


/* =========================================================
   VERIFY ZOHO WEBHOOK SIGNATURE
   ========================================================= */

function verifyZohoSignature(
    rawBody,
    signatureHeader,
    signingKey
) {

    if (
        !signatureHeader ||
        !signingKey
    ) {
        return false;
    }


    const timestampMatch =
        signatureHeader.match(
            /(?:^|,)t=([^,]+)/
        );


    const signatureMatch =
        signatureHeader.match(
            /(?:^|,)v=([a-f0-9]+)/i
        );


    if (
        !timestampMatch ||
        !signatureMatch
    ) {
        return false;
    }


    const timestamp =
        timestampMatch[1];


    const receivedSignature =
        signatureMatch[1];


    const timestampNumber =
        Number(timestamp);


    if (
        !Number.isFinite(
            timestampNumber
        )
    ) {
        return false;
    }


    /*
     * Reject very old webhook requests.
     * This also helps protect against replay attacks.
     */

    const timestampMilliseconds =
        timestampNumber < 100000000000
            ? timestampNumber * 1000
            : timestampNumber;


    const age =
        Math.abs(
            Date.now() -
            timestampMilliseconds
        );


    if (
        age >
        5 * 60 * 1000
    ) {
        console.error(
            "Zoho webhook timestamp expired."
        );

        return false;
    }


    const signedPayload =
        `${timestamp}.${rawBody}`;


    const calculatedSignature =
        crypto
            .createHmac(
                "sha256",
                signingKey
            )
            .update(
                signedPayload
            )
            .digest("hex");


    try {

        return crypto.timingSafeEqual(

            Buffer.from(
                calculatedSignature,
                "utf8"
            ),

            Buffer.from(
                receivedSignature,
                "utf8"
            )

        );

    } catch {

        return false;

    }

}


/* =========================================================
   GET ZOHO ACCESS TOKEN
   ========================================================= */

async function getZohoAccessToken() {

    const tokenParams =
        new URLSearchParams({

            refresh_token:
                process.env.ZOHO_REFRESH_TOKEN,

            client_id:
                process.env.ZOHO_CLIENT_ID,

            client_secret:
                process.env.ZOHO_CLIENT_SECRET,

            grant_type:
                "refresh_token"

        });


    const response =
        await fetch(
            "https://accounts.zoho.in/oauth/v2/token",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    tokenParams.toString()
            }
        );


    const data =
        await response.json();


    if (
        !response.ok ||
        !data.access_token
    ) {

        console.error(
            "Zoho webhook token error:",
            data
        );

        throw new Error(
            "Unable to authenticate with Zoho Payments."
        );

    }


    return data.access_token;

}


/* =========================================================
   RETRIEVE PAYMENT SESSION
   ========================================================= */

async function getPaymentSession(
    paymentSessionId,
    accessToken
) {

    const accountId =
        process.env.ZOHO_PAYMENTS_ACCOUNT_ID;


    const response =
        await fetch(

            `https://payments.zoho.in/api/v1/paymentsessions/${encodeURIComponent(
                paymentSessionId
            )}?account_id=${encodeURIComponent(
                accountId
            )}`,

            {
                method: "GET",

                headers: {
                    "Authorization":
                        `Zoho-oauthtoken ${accessToken}`
                }
            }

        );


    const data =
        await response.json();


    if (
        !response.ok ||
        !data.payments_session
    ) {

        console.error(
            "Zoho payment session retrieve error:",
            data
        );

        throw new Error(
            "Unable to retrieve Zoho payment session."
        );

    }


    return data.payments_session;

}


/* =========================================================
   UPDATE GOOGLE SHEETS
   ========================================================= */

async function updateGoogleSheet(
    updateData
) {

    const response =
        await fetch(
            GOOGLE_SHEET_WEBHOOK_URL,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        updateData
                    )
            }
        );


    const responseText =
        await response.text();


    let result;

    try {

        result =
            JSON.parse(
                responseText
            );

    } catch {

        throw new Error(
            "Google Sheets returned an invalid response."
        );

    }


    if (
        !response.ok ||
        !result.success
    ) {

        console.error(
            "Google Sheets update failed:",
            result
        );

        throw new Error(
            result.message ||
            "Google Sheets update failed."
        );

    }


    return result;

}


/* =========================================================
   WEBHOOK HANDLER
   ========================================================= */

export default async function handler(
    req,
    res
) {

    if (
        req.method !== "POST"
    ) {

        return res.status(405).json({

            success:
                false,

            message:
                "Method not allowed."

        });

    }


    try {

        /* -------------------------------------------------
           RAW BODY
           ------------------------------------------------- */

        const rawBody =
            await getRawBody(
                req
            );


        /* -------------------------------------------------
           SIGNATURE
           ------------------------------------------------- */

        const signature =
            req.headers[
                "x-zoho-webhook-signature"
            ];


        const signingKey =
            process.env
                .ZOHO_WEBHOOK_SIGNING_KEY;


        if (
            !verifyZohoSignature(
                rawBody,
                signature,
                signingKey
            )
        ) {

            console.error(
                "Invalid Zoho webhook signature."
            );


            return res.status(401).json({

                success:
                    false,

                message:
                    "Invalid webhook signature."

            });

        }


        /* -------------------------------------------------
           PARSE EVENT
           ------------------------------------------------- */

        const data =
            JSON.parse(
                rawBody
            );


        const eventId =
            String(
                data.event_id || ""
            );


        const eventType =
            data.event_type;


        console.log(
            "Zoho webhook received:",
            {
                eventId,
                eventType
            }
        );


        /* -------------------------------------------------
           ONLY PAYMENT EVENTS
           ------------------------------------------------- */

        if (
            eventType !==
                "payment.succeeded" &&
            eventType !==
                "payment.failed"
        ) {

            return res.status(200).json({

                success:
                    true,

                message:
                    "Event received but not required."

            });

        }


        /* -------------------------------------------------
           PAYMENT OBJECT
           ------------------------------------------------- */

        const payment =
            data
                ?.event_object
                ?.payment;


        if (!payment) {

            return res.status(400).json({

                success:
                    false,

                message:
                    "Payment data missing."

            });

        }


        const paymentId =
            String(
                payment.payment_id || ""
            );


        const paymentSessionId =
            String(
                payment.payments_session_id ||
                ""
            );


        const registrationId =
            String(
                payment.reference_number ||
                ""
            );


        if (
            !paymentSessionId ||
            !registrationId
        ) {

            console.error(
                "Required payment identifiers missing:",
                payment
            );


            return res.status(400).json({

                success:
                    false,

                message:
                    "Payment session or registration ID missing."

            });

        }


        /* -------------------------------------------------
           GET ZOHO ACCESS TOKEN
           ------------------------------------------------- */

        const accessToken =
            await getZohoAccessToken();


        /* -------------------------------------------------
           VERIFY CURRENT SESSION STATUS
           ------------------------------------------------- */

        const paymentSession =
            await getPaymentSession(
                paymentSessionId,
                accessToken
            );


        const sessionStatus =
            String(
                paymentSession.status ||
                ""
            ).toLowerCase();


        const payments =
            Array.isArray(
                paymentSession.payments
            )
                ? paymentSession.payments
                : [];


        /* -------------------------------------------------
           COUNT ACTUAL ATTEMPTS
           ------------------------------------------------- */

        const paymentAttemptCount =
            payments.length;


        const paymentFailedCount =
            payments.filter(
                item =>
                    String(
                        item.status ||
                        ""
                    ).toLowerCase() ===
                    "failed"
            ).length;


        /* =================================================
           PAYMENT SUCCEEDED
           ================================================= */

        if (
            eventType ===
            "payment.succeeded"
        ) {

            /*
             * A successful payment closes the session.
             */

            if (
                sessionStatus !==
                "succeeded"
            ) {

                console.error(
                    "Success webhook but session is not succeeded:",
                    sessionStatus
                );

                return res.status(409).json({

                    success:
                        false,

                    message:
                        "Payment session status mismatch."

                });

            }


            const paymentMethod =
                payment
                    ?.payment_method
                    ?.type ||
                "";


            const paymentAmount =
                payment.amount ||
                paymentSession.amount ||
                "";


            const sheetResult =
                await updateGoogleSheet({

                    action:
                        "payment_succeeded",

                    event_id:
                        eventId,

                    registration_id:
                        registrationId,

                    payment_id:
                        paymentId,

                    payment_session_id:
                        paymentSessionId,

                    payment_status:
                        "Payment Successful",

                    payment_failed_count:
                        paymentFailedCount,

                    payment_attempt_count:
                        paymentAttemptCount,

                    payment_method:
                        paymentMethod,

                    payment_amount:
                        paymentAmount

                });


            console.log(
                "Payment success sheet update:",
                sheetResult
            );


            return res.status(200).json({

                success:
                    true,

                event:
                    "payment.succeeded",

                registration_id:
                    registrationId,

                payment_id:
                    paymentId

            });

        }


        /* =================================================
           PAYMENT FAILED
           ================================================= */

        if (
            eventType ===
            "payment.failed"
        ) {

            /*
             * Zoho sends payment.failed for every attempt.
             *
             * If the session is still active,
             * do NOT mark the registration as finally failed.
             */

            if (
                sessionStatus !==
                    "failed"
            ) {

                console.log(
                    "Payment attempt failed, but session is still active:",
                    sessionStatus
                );


                return res.status(200).json({

                    success:
                        true,

                    event:
                        "payment.failed",

                    message:
                        "Payment attempt failed, but session remains active."

                });

            }


            const paymentAmount =
                payment.amount ||
                paymentSession.amount ||
                "";


            const sheetResult =
                await updateGoogleSheet({

                    action:
                        "payment_failed",

                    event_id:
                        eventId,

                    registration_id:
                        registrationId,

                    payment_id:
                        "",

                    payment_session_id:
                        paymentSessionId,

                    payment_status:
                        "Payment Failed",

                    payment_failed_count:
                        paymentFailedCount,

                    payment_attempt_count:
                        paymentAttemptCount,

                    payment_method:
                        payment
                            ?.payment_method
                            ?.type ||
                        "",

                    payment_amount:
                        paymentAmount

                });


            console.log(
                "Payment failure sheet update:",
                sheetResult
            );


            return res.status(200).json({

                success:
                    true,

                event:
                    "payment.failed",

                registration_id:
                    registrationId

            });

        }


    } catch (error) {

        console.error(
            "Zoho webhook error:",
            error
        );


        return res.status(500).json({

            success:
                false,

            message:
                "Webhook processing failed."

        });

    }

}
