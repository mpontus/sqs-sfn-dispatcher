import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";

interface SqsSfnDispatcherProps {
  source: sqs.IQueue;
  target: sfn.IStateMachine;
}

export class SqsSfnDispatcher extends Construct {
  public stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: SqsSfnDispatcherProps) {
    super(scope, id);

    const getMessages = new tasks.CallAwsService(this, "GetMessages", {
      service: "sqs",
      action: "receiveMessage",
      parameters: {
        QueueUrl: props.source.queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
      },
      iamResources: [props.source.queueArn],
    });

    const mapState = new sfn.Map(this, "Map", {
      itemsPath: "$.Messages",
      maxConcurrency: 10,
      resultPath: "$.processedMessages",
    });

    getMessages.next(mapState);

    const processItem = new tasks.StepFunctionsStartExecution(
      this,
      "ProcessItem",
      {
        stateMachine: props.target,
        input: sfn.TaskInput.fromJsonPathAt("$.Body"),
        resultPath: sfn.JsonPath.DISCARD,
      }
    );

    // After processing, return the ReceiptHandle for successful messages
    const successState = new sfn.Pass(this, "Success", {
      parameters: {
        "Id.$": "States.Format('{}', States.UUID())",
        "ReceiptHandle.$": "$.ReceiptHandle",
      },
    });

    processItem.next(successState);
    mapState.itemProcessor(processItem);

    // Delete all successfully processed messages in batch
    const deleteMessages = new tasks.CallAwsService(
      this,
      "DeleteMessageBatch",
      {
        service: "sqs",
        action: "deleteMessageBatch",
        parameters: {
          QueueUrl: props.source.queueUrl,
          "Entries.$": "$.processedMessages",
        },
        iamResources: [props.source.queueArn],
      }
    );
    mapState.next(deleteMessages);

    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(getMessages),
    });

    props.source.grant(stateMachine.role, "sqs:DeleteMessage");

    this.stateMachine = stateMachine;
  }
}
