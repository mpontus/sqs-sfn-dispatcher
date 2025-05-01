import { App, Stack, Duration } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { IntegTest } from "@aws-cdk/integ-tests-alpha";
import { SqsSfnDispatcher } from "../lib/sqs-sfn-dispatcher";

const app = new App();
const stack = new Stack(app, "TestStack");

// Create a simple target state machine that just succeeds
const targetStateMachine = new sfn.StateMachine(stack, "TargetStateMachine", {
  definition: new sfn.Succeed(stack, "Success"),
});

// Create source queue
const queue = new sqs.Queue(stack, "SourceQueue", {
  visibilityTimeout: Duration.seconds(30),
});

// Create the dispatcher
const dispatcher = new SqsSfnDispatcher(stack, "Dispatcher", {
  source: queue,
  target: targetStateMachine,
});

// Create the integration test
const integ = new IntegTest(app, "DispatcherTest", {
  testCases: [stack],
  diffAssets: true,
});

// Send test messages to the queue
const sendMessages = integ.assertions.awsApiCall("SQS", "sendMessageBatch", {
  QueueUrl: queue.queueUrl,
  Entries: [
    {
      Id: "1",
      MessageBody: JSON.stringify({ data: "message1" }),
    },
    {
      Id: "2",
      MessageBody: JSON.stringify({ data: "message2" }),
    },
    {
      Id: "3",
      MessageBody: JSON.stringify({ data: "message3" }),
    },
  ],
});

// Start the dispatcher state machine
const startExecution = integ.assertions
  .awsApiCall("StepFunctions", "startExecution", {
    stateMachineArn: dispatcher.stateMachine.stateMachineArn,
  })
  .next(
    // Wait for execution to complete
    integ.assertions
      .awsApiCall("StepFunctions", "describeExecution", {
        executionArn: sfn.JsonPath.stringAt("$.executionArn"),
      })
      .waitForAssertions({
        timeout: Duration.seconds(30),
        assertions: [
          {
            assertionType: "objectLike",
            actual: sfn.JsonPath.stringAt("$.status"),
            expected: "SUCCEEDED",
          },
        ],
      })
  );

// Chain the assertions
sendMessages.next(startExecution);

// Verify queue is empty after processing
integ.assertions
  .awsApiCall("SQS", "getQueueAttributes", {
    QueueUrl: queue.queueUrl,
    AttributeNames: ["ApproximateNumberOfMessages"],
  })
  .expect(
    ExpectedResult.objectLike({
      Attributes: {
        ApproximateNumberOfMessages: "0",
      },
    })
  );

app.synth();
