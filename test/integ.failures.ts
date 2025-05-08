import { App, Stack, Duration } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { ExpectedResult, IntegTest, Match } from "@aws-cdk/integ-tests-alpha";
import { SqsSfnDispatcher } from "../lib/sqs-sfn-dispatcher";

const app = new App();
const stack = new Stack(app, "TestStack");

// Create a target state machine that succeeds for even numbers and fails for odd numbers
const checkEven = new sfn.Choice(stack, "CheckEven", {
  queryLanguage: sfn.QueryLanguage.JSONATA,
})
  .when(
    sfn.Condition.jsonata("{% $states.input.number % 2 = 0 %}"),
    new sfn.Succeed(stack, "Succeed")
  )
  .otherwise(new sfn.Fail(stack, "Fail"));

const targetStateMachine = new sfn.StateMachine(stack, "TargetStateMachine", {
  definition: checkEven,
});

// Create source queue
const queue = new sqs.Queue(stack, "SourceQueue", {
  visibilityTimeout: Duration.minutes(5),
});

// Create the dispatcher
const dispatcher = new SqsSfnDispatcher(stack, "Dispatcher", {
  source: queue,
  target: targetStateMachine,
  batchSize: 10, // Using a smaller batch size for testing
});

// Create the integration test
const integ = new IntegTest(app, "DispatcherTest", {
  testCases: [stack],
});

// Create 10 messages with incrementing numbers
const messageCount = 10;
const events = Array.from({ length: messageCount }).map((_, i) => ({
  Id: `${i}`,
  MessageBody: JSON.stringify({ number: i }),
}));

// Send test messages to the queue
const sendMessages = integ.assertions.awsApiCall("SQS", "sendMessageBatch", {
  QueueUrl: queue.queueUrl,
  Entries: events,
});

sendMessages.provider.addPolicyStatementFromSdkCall("sqs", "sendMessage", [
  queue.queueArn,
]);

// Check failed executions
const listFailedExecutions = integ.assertions.awsApiCall(
  "StepFunctions",
  "listExecutions",
  {
    stateMachineArn: targetStateMachine.stateMachineArn,
    statusFilter: "FAILED",
  }
);
listFailedExecutions.provider.addPolicyStatementFromSdkCall(
  "states",
  "listExecutions",
  [targetStateMachine.stateMachineArn]
);

// Assert that half of the executions failed (odd numbers)
listFailedExecutions
  .expect(
    ExpectedResult.objectLike({
      executions: Array.from({ length: messageCount / 2 }).map(() => ({
        status: "FAILED",
      })),
    })
  )
  .waitForAssertions({
    totalTimeout: Duration.seconds(30),
  });

// Check remaining messages in the queue (should be the odd-numbered ones)
const getQueueAttributes = integ.assertions.awsApiCall(
  "SQS",
  "getQueueAttributes",
  {
    QueueUrl: queue.queueUrl,
    AttributeNames: ["ApproximateNumberOfMessagesNotVisible"],
  }
);
getQueueAttributes.provider.addPolicyStatementFromSdkCall(
  "sqs",
  "getQueueAttributes",
  [queue.queueArn]
);

// Assert that half of the messages remain in the queue (the odd-numbered ones)
getQueueAttributes.expect(
  ExpectedResult.objectLike({
    Attributes: {
      ApproximateNumberOfMessagesNotVisible: `${messageCount / 2}`,
    },
  })
);

sendMessages.next(listFailedExecutions);
listFailedExecutions.next(getQueueAttributes);

app.synth();
