/* eslint complexity: ["error", 30] */

import { BotFrameworkConfig, DialogServiceConnector, PropertyId } from 'microsoft-cognitiveservices-speech-sdk';

import createWebSpeechPonyfillFactory from './createWebSpeechPonyfillFactory';
import DirectLineSpeech from './DirectLineSpeech';
import patchDialogServiceConnectorInline from './patchDialogServiceConnectorInline';
import resolveFunctionOrReturnValue from './resolveFunctionOrReturnValue';

const TOKEN_RENEWAL_INTERVAL = 120000;

export default async function create({
  audioConfig,
  audioContext,
  enableTelemetry,
  fetchCredentials,
  speechRecognitionEndpointId,
  speechRecognitionLanguage = (typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    window.navigator.language) ||
    'en-US',
  speechSynthesisDeploymentId,
  speechSynthesisOutputFormat,
  textNormalization,
  userID,
  username
}) {
  if (!fetchCredentials) {
    throw new Error('"fetchCredentials" must be specified.');
  }

  const { authorizationToken, region, subscriptionKey } = await resolveFunctionOrReturnValue(fetchCredentials);

  if (
    (!authorizationToken && !subscriptionKey) ||
    (authorizationToken && subscriptionKey) ||
    (authorizationToken && typeof authorizationToken !== 'string') ||
    (subscriptionKey && typeof subscriptionKey !== 'string')
  ) {
    throw new Error(
      '"fetchCredentials" must return either "authorizationToken" or "subscriptionKey" as a non-empty string only.'
    );
  }

  if (typeof enableTelemetry !== 'undefined') {
    console.warn(
      'botframework-directlinespeech: Telemetry options is not supported yet. Please refer to Cognitive Services documentation for details.'
    );
  }

  if (!region || typeof region !== 'string') {
    throw new Error('"fetchCredentials" must return "region" as a non-empty string.');
  }

  if (speechRecognitionEndpointId) {
    console.warn(
      'botframework-directlinespeech: Custom Speech is currently not supported, ignoring speechRecognitionEndpointId.'
    );
  }

  if (speechSynthesisDeploymentId) {
    console.warn(
      'botframework-directlinespeech: Custom Voice is currently not supported, ignoring speechSynthesisDeploymentId.'
    );
  }

  if (speechSynthesisOutputFormat) {
    console.warn(
      'botframework-directlinespeech: Synthesis output format is currently not supported, ignoring speechSynthesisOutputFormat.'
    );
  }

  if (textNormalization) {
    console.warn(
      'botframework-directlinespeech: Text normalization is currently not supported, ignoreing "textNormalization".'
    );
  }

  if (userID || username) {
    console.warn(
      'botframework-directlinespeech: Custom "userId" and "username" are currently not supported, ignoring.'
    );
  }

  let config;

  if (authorizationToken) {
    config = BotFrameworkConfig.fromAuthorizationToken(authorizationToken, region);
  } else {
    config = BotFrameworkConfig.fromSubscription(subscriptionKey, region);
  }

  // Supported options can be found in DialogConnectorFactory.js.

  config.setProperty(PropertyId.SpeechServiceConnection_RecoLanguage, speechRecognitionLanguage);

  // The following code set the output format. But currently, none of the following works for setting detailed output format.
  // We will leave these code commented until the Speech SDK support, possibly it in one of the way mentioned below.

  // config.setProperty(PropertyId.SpeechServiceResponse_OutputFormatOption, OutputFormat[OutputFormat.Detailed]);
  // config.setProperty(PropertyId.SpeechServiceResponse_RequestDetailedResultTrueFalse, true);
  // config.setProperty(OutputFormatPropertyName, OutputFormat[OutputFormat.Detailed]);
  // config.setServiceProperty(PropertyId.SpeechServiceResponse_RequestDetailedResultTrueFalse, "true", ServicePropertyChannel.UriQueryParameter);

  // The following code is copied from C#, it should set from.id, but it did not.
  // https://github.com/Azure-Samples/Cognitive-Services-Direct-Line-Speech-Client/blob/master/DLSpeechClient/MainWindow.xaml.cs#L236
  userID && config.setProperty(PropertyId.Conversation_From_Id, userID);

  // The following code is copied from C#, and it is not working yet.
  // https://github.com/Azure-Samples/Cognitive-Services-Direct-Line-Speech-Client/blob/master/DLSpeechClient/MainWindow.xaml.cs
  // speechRecognitionEndpointId && config.setServiceProperty('cid', speechRecognitionEndpointId, ServicePropertyChannel.UriQueryParameter);
  // speechSynthesisDeploymentId && config.setProperty(PropertyId.conversation_Custom_Voice_Deployment_Ids, speechSynthesisDeploymentId);

  const dialogServiceConnector = patchDialogServiceConnectorInline(new DialogServiceConnector(config, audioConfig));

  dialogServiceConnector.connect();

  // Renew token
  if (authorizationToken) {
    const interval = setInterval(async () => {
      // If the connector has been disposed, we should stop renewing the token.
      // TODO: We should use a public implementation if Speech SDK has one.
      if (dialogServiceConnector.privIsDisposed) {
        clearInterval(interval);
      }

      const { authorizationToken, region: nextRegion } = await resolveFunctionOrReturnValue(fetchCredentials);

      if (!authorizationToken) {
        return console.warn(
          'botframework-directlinespeech-sdk: Renew token failed because "fetchCredentials" call returned no authorization token.'
        );
      }

      if (region !== nextRegion) {
        return console.warn(
          'botframework-directlinespeech-sdk: Region change is not supported for renewed token. Authorization token is not renewed.'
        );
      }

      dialogServiceConnector.authorizationToken = authorizationToken; // eslint-disable-line require-atomic-updates
    }, TOKEN_RENEWAL_INTERVAL);
  }

  const directLine = new DirectLineSpeech({ dialogServiceConnector });

  const webSpeechPonyfillFactory = createWebSpeechPonyfillFactory({
    audioConfig,
    audioContext,
    enableTelemetry,
    recognizer: dialogServiceConnector,
    textNormalization
  });

  return {
    directLine,
    webSpeechPonyfillFactory
  };
}
