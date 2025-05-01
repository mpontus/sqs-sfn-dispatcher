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

    const deleteMessage = new tasks.CallAwsService(this, "DeleteMessage", {
      service: "sqs",
      action: "deleteMessage",
      parameters: {
        QueueUrl: props.source.queueUrl,
        ReceiptHandle: sfn.JsonPath.stringAt("$.ReceiptHandle"),
      },
      iamResources: [props.source.queueArn],
    });

    processItem.next(deleteMessage);

    mapState.itemProcessor(processItem);

    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(getMessages),
    });

    this.stateMachine = stateMachine;
  }
}
